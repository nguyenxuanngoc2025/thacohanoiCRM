import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';

const VALID_EVENTS = ['new_lead', 'overdue', 'status_change'];

// CRUD notification_channels (kênh Zalo / Telegram nhận thông báo)
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    const op = body.op as 'create' | 'update' | 'delete';

    if (op === 'delete') {
      const { error } = await service.from('notification_channels').delete().eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    const channel = body.channel === 'telegram' ? 'telegram' : 'zalo';
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Thiếu tên kênh' }, { status: 400 });
    const events = Array.isArray(body.events)
      ? body.events.filter((e: string) => VALID_EVENTS.includes(e))
      : ['new_lead'];
    const row = {
      channel,
      name,
      target: body.target ? String(body.target).trim() : null,
      events: events.length ? events : ['new_lead'],
      is_active: body.is_active ?? true,
    };

    if (op === 'update') {
      const { error } = await service.from('notification_channels').update(row).eq('id', body.id);
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
