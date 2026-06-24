import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';

const VALID_EVENTS = ['new_lead', 'overdue', 'daily_report'];

// CRUD notification_channels (kênh Zalo / Telegram nhận thông báo)
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    const op = body.op as 'create' | 'update' | 'delete' | 'test';

    if (op === 'delete') {
      const { error } = await service.from('notification_channels').delete().eq('id', body.id).eq('company_id', companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (op === 'test') {
      const { data: ch, error: chErr } = await service
        .from('notification_channels')
        .select('id, channel, target, name, scope, showroom_id')
        .eq('id', body.id)
        .eq('company_id', companyId)
        .maybeSingle();
      if (chErr || !ch) return NextResponse.json({ error: 'Không tìm thấy kênh' }, { status: 404 });
      const text = `THÔNG BÁO THỬ — ${ch.name}\nNếu bạn thấy tin này trong nhóm, cấu hình đã đúng.`;
      const { error } = await service.from('notifications').insert({
        channel: ch.channel,
        channel_id: ch.id,
        status: 'pending',
        payload: { event: 'test', target: ch.target, text },
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    const channel = body.channel === 'telegram' ? 'telegram' : 'zalo';
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Thiếu tên kênh' }, { status: 400 });
    const events = Array.isArray(body.events)
      ? body.events.filter((e: string) => VALID_EVENTS.includes(e))
      : ['new_lead'];
    const scope = body.scope === 'management' ? 'management' : 'showroom';
    const row = {
      channel,
      name,
      target: body.target ? String(body.target).trim() : null,
      events: events.length ? events : ['new_lead'],
      is_active: body.is_active ?? true,
      scope,
      // Nhóm BLĐ không gắn showroom; nhóm showroom phải có showroom_id
      showroom_id: scope === 'management' ? null : (body.showroom_id || null),
    };

    if (op === 'update') {
      const { error } = await service.from('notification_channels').update(row).eq('id', body.id).eq('company_id', companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    const { data, error } = await service
      .from('notification_channels')
      .insert({ ...row, company_id: companyId })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
