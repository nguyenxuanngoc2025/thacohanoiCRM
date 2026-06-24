import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';

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
    const showroom_id = body.showroom_id || null;
    const brand_id = body.brand_id || null;
    if (!page_id) return NextResponse.json({ error: 'Thiếu mã trang / biểu mẫu (page_id)' }, { status: 400 });
    if (!showroom_id) return NextResponse.json({ error: 'Chọn showroom' }, { status: 400 });
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

    if (op === 'update') {
      const { error } = await service.from('channel_accounts').update(row).eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    const { data, error } = await service.from('channel_accounts').insert(row).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
