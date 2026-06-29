import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { subscribePageWebhook } from '@/lib/facebook';

// CRUD channel_accounts (trang/biểu mẫu của 1 kênh → showroom · thương hiệu · chiến dịch)
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    const op = body.op as 'create' | 'update' | 'delete';

    // channel_accounts không có company_id → cô lập qua showroom của công ty.
    const { data: srRows } = await service.from('showrooms').select('id').eq('company_id', companyId);
    const companySrIds = ((srRows ?? []) as { id: string }[]).map((r) => r.id);

    // Kênh sửa/xoá phải gắn showroom thuộc công ty của admin. Giữ lại cấu hình chia cũ để so sánh.
    let existingStrategy: string | null = null;
    const existingShareMap: Record<string, number> = {};
    if (op === 'update' || op === 'delete') {
      const { data: existing } = await service.from('channel_accounts').select('showroom_id, showroom_assign_strategy').eq('id', body.id).maybeSingle();
      if (!existing || !companySrIds.includes(existing.showroom_id as string)) {
        return NextResponse.json({ error: 'Kênh không thuộc công ty của bạn.' }, { status: 404 });
      }
      existingStrategy = (existing.showroom_assign_strategy as string) ?? null;
      const { data: oldJunction } = await service.from('channel_account_showrooms').select('showroom_id, share_pct').eq('channel_account_id', body.id);
      for (const j of (oldJunction ?? []) as { showroom_id: string; share_pct: number }[]) {
        existingShareMap[j.showroom_id] = Number(j.share_pct) || 0;
      }
    }

    if (op === 'delete') {
      const { error } = await service.from('channel_accounts').delete().eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    const page_id = body.page_id ? String(body.page_id).trim() : '';
    const brand_id = body.brand_id || null;
    // 1 kênh có thể phục vụ nhiều showroom; showroom_ids[] là nguồn chính, showroom_id = anchor (phần tử đầu).
    const showroom_ids: string[] = Array.isArray(body.showroom_ids)
      ? body.showroom_ids.filter(Boolean)
      : (body.showroom_id ? [body.showroom_id] : []);
    const showroom_id = showroom_ids[0] ?? null;
    if (!page_id) return NextResponse.json({ error: 'Thiếu mã trang / biểu mẫu (page_id)' }, { status: 400 });
    if (showroom_ids.length === 0) return NextResponse.json({ error: 'Chọn ít nhất 1 showroom' }, { status: 400 });
    if (!brand_id) return NextResponse.json({ error: 'Chọn thương hiệu' }, { status: 400 });
    // Mọi showroom gán cho kênh phải thuộc công ty của admin.
    if (showroom_ids.some((sid) => !companySrIds.includes(sid))) {
      return NextResponse.json({ error: 'Showroom không thuộc công ty của bạn.' }, { status: 400 });
    }
    const platform = String(body.platform ?? 'facebook').toLowerCase().trim() || 'facebook';
    // Secret OA (Zalo) để xác thực chữ ký webhook. Để trống khi sửa = giữ nguyên secret cũ.
    const secret = typeof body.secret === 'string' ? body.secret.trim() : '';
    // CẤP 1 (kênh → showroom): kiểu chia + % của từng showroom đặt ngay trên kênh này.
    const ALLOWED_STRATEGIES = ['least_loaded', 'round_robin', 'weighted'];
    const showroom_assign_strategy = ALLOWED_STRATEGIES.includes(body.showroom_assign_strategy)
      ? body.showroom_assign_strategy
      : 'least_loaded';
    const shares: Record<string, number> =
      body.showroom_shares && typeof body.showroom_shares === 'object' ? body.showroom_shares : {};

    // Map % mới (chỉ cho showroom đang chọn) để so với cấu hình cũ → quyết định có đặt lại mốc hiệu lực.
    const newShareMap: Record<string, number> = {};
    for (const sid of showroom_ids) newShareMap[sid] = Number(shares[sid]) || 0;
    const sameShares = (a: Record<string, number>, b: Record<string, number>) => {
      const ak = Object.keys(a), bk = Object.keys(b);
      if (ak.length !== bk.length) return false;
      return ak.every((k) => a[k] === b[k]);
    };
    // Đổi cách chia / tỷ lệ % / danh sách showroom → phân bổ "hiệu lực kể từ thời điểm thay đổi":
    // đặt lại mốc = bây giờ để ingest chỉ đếm lead phát sinh sau đó. Tạo kênh mới cũng tính từ bây giờ.
    const distChanged =
      op !== 'update' ||
      showroom_assign_strategy !== existingStrategy ||
      !sameShares(newShareMap, existingShareMap);

    const row = {
      platform,
      page_id,
      page_name: body.page_name ? String(body.page_name).trim() : null,
      showroom_id,
      brand_id,
      campaign: body.campaign ? String(body.campaign).trim() : null,
      showroom_assign_strategy,
      is_active: body.is_active ?? true,
      ...(distChanged ? { assign_effective_from: new Date().toISOString() } : {}),
      ...(secret ? { secret } : {}),
    };

    // Đồng bộ junction channel_account_showrooms: xoá cũ + chèn mới (kèm % phân bổ của kênh).
    const syncShowrooms = async (channelId: string) => {
      await service.from('channel_account_showrooms').delete().eq('channel_account_id', channelId);
      await service.from('channel_account_showrooms').insert(
        showroom_ids.map((sid) => ({
          channel_account_id: channelId,
          showroom_id: sid,
          share_pct: Number(shares[sid]) || 0,
        }))
      );
    };

    // Tự đăng ký webhook cho fanpage (chỉ Facebook). Không chặn lưu nếu lỗi —
    // trả subscribe_error để UI cảnh báo (vd page chưa nằm trong BM).
    const subscribe = async (): Promise<string | null> => {
      if (row.platform !== 'facebook') return null;
      const res = await subscribePageWebhook(page_id);
      return res.ok ? null : (res.error ?? 'Đăng ký webhook thất bại.');
    };

    if (op === 'update') {
      const { error } = await service.from('channel_accounts').update(row).eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await syncShowrooms(body.id);
      const subscribe_error = await subscribe();
      return NextResponse.json({ success: true, subscribe_error });
    }

    const { data, error } = await service.from('channel_accounts').insert(row).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await syncShowrooms(data.id);
    const subscribe_error = await subscribe();
    return NextResponse.json({ success: true, id: data.id, subscribe_error });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
