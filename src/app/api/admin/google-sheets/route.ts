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
    const brand_id = body.brand_id || null;
    const showroom_ids: string[] = Array.isArray(body.showroom_ids) ? body.showroom_ids.filter(Boolean) : [];
    const showroom_id = showroom_ids[0] ?? null;
    if (!spreadsheetId) return NextResponse.json({ error: 'Thiếu Google Sheet' }, { status: 400 });
    if (showroom_ids.length === 0) return NextResponse.json({ error: 'Chọn ít nhất 1 showroom' }, { status: 400 });
    if (!brand_id) return NextResponse.json({ error: 'Chọn thương hiệu' }, { status: 400 });
    if (showroom_ids.some((sid) => !companySrIds.includes(sid))) {
      return NextResponse.json({ error: 'Showroom không thuộc công ty của bạn.' }, { status: 400 });
    }

    const { data: conn } = await service.from('google_connections').select('id').eq('company_id', companyId).maybeSingle();
    if (!conn) return NextResponse.json({ error: 'Công ty chưa kết nối Google' }, { status: 400 });

    const phoneCol = Number(body.phone_col);
    if (!Number.isInteger(phoneCol) || phoneCol < 0) return NextResponse.json({ error: 'Chưa chọn cột Số điện thoại' }, { status: 400 });
    const nameCol = body.name_col == null || body.name_col === '' ? null : Number(body.name_col);
    const noteCols: number[] = Array.isArray(body.note_cols) ? body.note_cols.map(Number).filter(Number.isInteger) : [];

    // Tab cần lấy lead: mảng object {title, source}. Tương thích cũ: mảng chuỗi / `tab` đơn.
    const rawTabs: unknown[] = Array.isArray(body.tabs)
      ? body.tabs
      : (body.tab ? [String(body.tab)] : []);
    const tabs = rawTabs
      .map((t) => {
        if (typeof t === 'string') return { title: t.trim(), source: null as string | null };
        const o = t as { title?: unknown; source?: unknown };
        return {
          title: String(o.title ?? '').trim(),
          source: o.source ? String(o.source).trim().toLowerCase() : null,
        };
      })
      .filter((t) => t.title);

    const sourceMode = body.source_mode === 'column' ? 'column' : 'fixed';
    const sourceCol = body.source_col == null || body.source_col === '' ? null : Number(body.source_col);
    const modelMode = body.model_mode === 'fixed' ? 'fixed' : body.model_mode === 'column' ? 'column' : 'auto';
    const modelId = modelMode === 'fixed' && body.model_id ? String(body.model_id) : null;
    const modelCol = modelMode === 'column' && body.model_col != null && body.model_col !== '' ? Number(body.model_col) : null;

    // Mốc thời gian: cột chứa thời gian + ngày bắt đầu lấy lead (YYYY-MM-DD).
    // Chỉ nạp dòng có thời gian >= since → tránh kết nối lần đầu nạp toàn bộ lead cũ.
    const dateCol = body.date_col == null || body.date_col === '' ? null : Number(body.date_col);
    const since = typeof body.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.since) ? body.since : null;

    const config = {
      connection_id: conn.id,
      tabs,
      source_mode: sourceMode,
      source_col: sourceMode === 'column' ? sourceCol : null,
      model_mode: modelMode,
      model_id: modelId,
      model_col: modelCol,
      phone_col: phoneCol,
      name_col: nameCol,
      note_cols: noteCols,
      date_col: dateCol,
      since,
    };
    const row = {
      platform: 'google_sheet',
      page_id: spreadsheetId,
      page_name: body.page_name ? String(body.page_name).trim() : null,
      showroom_id,
      brand_id,
      is_active: body.is_active ?? true,
      config,
    };

    const syncShowrooms = async (channelId: string) => {
      await service.from('channel_account_showrooms').delete().eq('channel_account_id', channelId);
      await service.from('channel_account_showrooms').insert(
        showroom_ids.map((sid) => ({ channel_account_id: channelId, showroom_id: sid }))
      );
    };

    if (op === 'update') {
      const { error } = await service.from('channel_accounts').update(row).eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await syncShowrooms(body.id);
      return NextResponse.json({ success: true });
    }

    const { data, error } = await service.from('channel_accounts').insert(row).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await syncShowrooms(data.id);
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
