import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { subscribePageWebhook } from '@/lib/facebook';

// CRUD channel_accounts (trang/biểu mẫu của 1 kênh → showroom · thương hiệu · chiến dịch)
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service } = guard.ctx;

  try {
    const body = await request.json();
    const op = body.op as 'create' | 'update' | 'delete';

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
    const row = {
      platform: String(body.platform ?? 'facebook').toLowerCase().trim() || 'facebook',
      page_id,
      page_name: body.page_name ? String(body.page_name).trim() : null,
      showroom_id,
      brand_id,
      campaign: body.campaign ? String(body.campaign).trim() : null,
      is_active: body.is_active ?? true,
    };

    // Đồng bộ junction channel_account_showrooms: xoá cũ + chèn mới
    const syncShowrooms = async (channelId: string) => {
      await service.from('channel_account_showrooms').delete().eq('channel_account_id', channelId);
      await service.from('channel_account_showrooms').insert(
        showroom_ids.map((sid) => ({ channel_account_id: channelId, showroom_id: sid }))
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
