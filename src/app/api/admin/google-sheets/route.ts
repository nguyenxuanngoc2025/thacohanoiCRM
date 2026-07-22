import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { getPlatformSetting } from '@/lib/platform-settings';
import { refreshAccessToken } from '@/lib/google';
import { decrypt } from '@/lib/crypto';
import { syncSheetChannel, type SheetConfig } from '@/lib/google-sheet-sync';

export const dynamic = 'force-dynamic';

// Lưu / cập nhật / xoá / đồng-bộ-ngay 1 Google Sheet đã kết nối (channel_accounts platform='google_sheet').
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    const op = body.op as 'create' | 'update' | 'delete' | 'sync';

    const { data: srRows } = await service.from('showrooms').select('id').eq('company_id', companyId);
    const companySrIds = ((srRows ?? []) as { id: string }[]).map((r) => r.id);

    if (op === 'update' || op === 'delete' || op === 'sync') {
      const { data: existing } = await service.from('channel_accounts').select('showroom_id').eq('id', body.id).maybeSingle();
      if (!existing || !companySrIds.includes(existing.showroom_id as string)) {
        return NextResponse.json({ error: 'Sheet không thuộc công ty của bạn.' }, { status: 404 });
      }
    }

    if (op === 'delete') {
      // Lead cũ vẫn giữ — chỉ gỡ tham chiếu tới sheet (FK leads.channel_account_id NO ACTION
      // sẽ chặn xoá nếu còn lead trỏ tới). channel_account_showrooms tự CASCADE.
      await service.from('leads').update({ channel_account_id: null }).eq('channel_account_id', body.id);
      const { error } = await service.from('channel_accounts').delete().eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    // Đồng bộ ngay: quét sheet này lập tức (thay vì chờ cron 5 phút).
    if (op === 'sync') {
      const clientId = await getPlatformSetting('google_oauth_client_id');
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      if (!clientId || !clientSecret) return NextResponse.json({ error: 'Nền tảng chưa cấu hình Google' }, { status: 400 });
      const { data: ch } = await service.from('channel_accounts').select('id, page_id, config').eq('id', body.id).maybeSingle();
      if (!ch) return NextResponse.json({ error: 'Không tìm thấy sheet' }, { status: 404 });
      const getToken = async (connectionId: string): Promise<string> => {
        const { data: conn } = await service.from('google_connections').select('refresh_token_enc').eq('id', connectionId).maybeSingle();
        if (!conn) throw new Error('connection-missing');
        return refreshAccessToken({ refreshToken: decrypt(conn.refresh_token_enc as string), clientId, clientSecret });
      };
      const res = await syncSheetChannel(
        service,
        { id: ch.id as string, page_id: ch.page_id as string, config: (ch.config ?? null) as SheetConfig | null },
        getToken,
      );
      return NextResponse.json({ success: true, ...res });
    }

    const spreadsheetId = body.spreadsheet_id ? String(body.spreadsheet_id).trim() : '';
    if (!spreadsheetId) return NextResponse.json({ error: 'Thiếu Google Sheet' }, { status: 400 });
    const editingId: string | null = op === 'update' ? (body.id as string) : null;

    // Mỗi tab một cấu hình riêng. Chuẩn hoá + validate từng tab theo phạm vi công ty.
    const rawTabs: unknown[] = Array.isArray(body.tabs) ? body.tabs : (body.tab ? [{ title: String(body.tab) }] : []);
    const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number(v));
    const tabs = rawTabs
      .map((t) => {
        const o = (typeof t === 'string' ? { title: t } : t) as Record<string, unknown>;
        const sids: string[] = Array.isArray(o.showroom_ids) ? (o.showroom_ids as unknown[]).filter(Boolean).map(String) : [];
        const smode = o.source_mode === 'column' ? 'column' : 'fixed';
        const mmode = o.model_mode === 'fixed' ? 'fixed' : o.model_mode === 'column' ? 'column' : 'auto';
        return {
          title: String(o.title ?? '').trim(),
          brand_id: o.brand_id ? String(o.brand_id) : null,
          showroom_ids: sids,
          phone_col: numOrNull(o.phone_col),
          name_col: numOrNull(o.name_col),
          note_cols: Array.isArray(o.note_cols) ? (o.note_cols as unknown[]).map(Number).filter(Number.isInteger) : [],
          source_mode: smode as 'fixed' | 'column',
          source: o.source ? String(o.source).trim().toLowerCase() : null,
          source_col: smode === 'column' ? numOrNull(o.source_col) : null,
          model_mode: mmode as 'auto' | 'fixed' | 'column',
          model_id: mmode === 'fixed' && o.model_id ? String(o.model_id) : null,
          model_col: mmode === 'column' ? numOrNull(o.model_col) : null,
          date_col: numOrNull(o.date_col),
          since: typeof o.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.since) ? o.since : null,
          address_col: numOrNull(o.address_col),
          address_fallback_province: o.address_col != null && o.address_col !== ''
            ? (o.address_fallback_province ? String(o.address_fallback_province).trim() : null) : null,
        };
      })
      .filter((t) => t.title);

    if (tabs.length === 0) return NextResponse.json({ error: 'Chọn ít nhất 1 tab' }, { status: 400 });
    for (const t of tabs) {
      if (t.phone_col == null) return NextResponse.json({ error: `Tab "${t.title}": chưa chọn cột Số điện thoại` }, { status: 400 });
      if (!t.brand_id) return NextResponse.json({ error: `Tab "${t.title}": chưa chọn thương hiệu` }, { status: 400 });
      if (t.showroom_ids.length === 0) return NextResponse.json({ error: `Tab "${t.title}": chọn ít nhất 1 showroom` }, { status: 400 });
      if (t.showroom_ids.some((sid) => !companySrIds.includes(sid))) {
        return NextResponse.json({ error: `Tab "${t.title}": showroom không thuộc công ty của bạn` }, { status: 400 });
      }
    }

    const { data: conn } = await service.from('google_connections').select('id').eq('company_id', companyId).maybeSingle();
    if (!conn) return NextResponse.json({ error: 'Công ty chưa kết nối Google' }, { status: 400 });

    // Junction = HỢP showroom của mọi tab (để tầng định tuyến cấp-1 có ứng viên; ghi đè theo tab quyết định thật).
    const unionShowroomIds = [...new Set(tabs.flatMap((t) => t.showroom_ids))];
    const anchorBrand = tabs[0].brand_id;
    const anchorShowroom = tabs[0].showroom_ids[0];

    const config = { connection_id: conn.id, spreadsheet_id: spreadsheetId, tabs };
    const row = {
      platform: 'google_sheet',
      page_id: spreadsheetId,
      page_name: body.page_name ? String(body.page_name).trim() : null,
      showroom_id: anchorShowroom,
      brand_id: anchorBrand,
      is_active: body.is_active ?? true,
      config,
    };

    const syncShowrooms = async (channelId: string) => {
      await service.from('channel_account_showrooms').delete().eq('channel_account_id', channelId);
      await service.from('channel_account_showrooms').insert(
        unionShowroomIds.map((sid) => ({ channel_account_id: channelId, showroom_id: sid }))
      );
    };

    // Chọn lại đúng file đã kết nối (cùng page_id trong công ty) → cập nhật dòng cũ thay vì tạo mới
    // (tránh đụng ràng buộc page_id UNIQUE + cho phép thêm/bớt/sửa tab).
    let targetId: string | null = editingId;
    if (!targetId) {
      const { data: dup } = await service.from('channel_accounts')
        .select('id, showroom_id').eq('page_id', spreadsheetId).maybeSingle();
      if (dup && companySrIds.includes(dup.showroom_id as string)) targetId = dup.id as string;
    }

    if (targetId) {
      const { error } = await service.from('channel_accounts').update(row).eq('id', targetId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await syncShowrooms(targetId);
      return NextResponse.json({ success: true, id: targetId });
    }

    const { data, error } = await service.from('channel_accounts').insert(row).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await syncShowrooms(data.id);
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
