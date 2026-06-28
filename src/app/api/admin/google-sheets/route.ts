import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

// Lưu / cập nhật / xoá 1 Google Sheet đã kết nối (channel_accounts platform='google_sheet').
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    const op = body.op as 'create' | 'update' | 'delete';

    const { data: srRows } = await service.from('showrooms').select('id').eq('company_id', companyId);
    const companySrIds = ((srRows ?? []) as { id: string }[]).map((r) => r.id);

    if (op === 'update' || op === 'delete') {
      const { data: existing } = await service.from('channel_accounts').select('showroom_id').eq('id', body.id).maybeSingle();
      if (!existing || !companySrIds.includes(existing.showroom_id as string)) {
        return NextResponse.json({ error: 'Sheet không thuộc công ty của bạn.' }, { status: 404 });
      }
    }

    if (op === 'delete') {
      const { error } = await service.from('channel_accounts').delete().eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
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

    // Tab cần lấy lead: ưu tiên mảng `tabs` (chọn nhiều), fallback `tab` (1 tab, tương thích cũ).
    const tabs: string[] = Array.isArray(body.tabs)
      ? body.tabs.map((t: unknown) => String(t).trim()).filter(Boolean)
      : (body.tab ? [String(body.tab).trim()] : []);

    const config = {
      connection_id: conn.id,
      tabs,
      phone_col: phoneCol,
      name_col: nameCol,
      note_cols: noteCols,
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
