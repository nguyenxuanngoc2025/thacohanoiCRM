import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { buildOverdueMessages, type OverdueLead } from '@/lib/reminders';

export const dynamic = 'force-dynamic';

// Anti-repeat: không nhắc lại lead đã nhắc trong X giờ gần nhất
const REPEAT_GUARD_HOURS = 6;

export async function POST(request: NextRequest) {
  if (!checkCronSecret(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = createServiceClient();
  const now = new Date();
  const guardCutoff = new Date(now.getTime() - REPEAT_GUARD_HOURS * 3600000).toISOString();

  // Lead quá hạn: tới/quá next_contact_at, CHƯA liên hệ, status chưa chốt/loại,
  // và chưa nhắc trong REPEAT_GUARD_HOURS.
  const { data: leads, error } = await db
    .from('leads')
    .select('id, showroom_id, full_name, phone, assigned_to, next_contact_at, showrooms(name), users(full_name)')
    .lte('next_contact_at', now.toISOString())
    .is('last_contact_at', null)
    .not('status', 'in', '("KHĐ","Fail")')
    .not('showroom_id', 'is', null)
    .or(`last_overdue_notified_at.is.null,last_overdue_notified_at.lt.${guardCutoff}`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapped: OverdueLead[] = (leads ?? []).map((l) => {
    const sr = l as unknown as { showrooms: { name: string } | null; users: { full_name: string } | null };
    return {
      id: l.id,
      showroom_id: l.showroom_id as string,
      showroom_name: sr.showrooms?.name ?? 'Showroom',
      full_name: l.full_name ?? null,
      phone: l.phone,
      assignee_name: sr.users?.full_name ?? null,
      next_contact_at: l.next_contact_at as string,
    };
  });

  const messages = buildOverdueMessages(mapped, now);
  if (messages.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  // Kênh showroom có sự kiện 'overdue'
  const { data: channels } = await db
    .from('notification_channels')
    .select('id, channel, target, events, showroom_id, scope')
    .eq('is_active', true);

  const inserts: Record<string, unknown>[] = [];
  const notifiedLeadIds: string[] = [];
  for (const m of messages) {
    const targets = (channels ?? []).filter(
      (c) => (c.events ?? []).includes('overdue') && c.scope === 'showroom' && c.showroom_id === m.showroomId
    );
    if (targets.length === 0) continue;
    for (const c of targets) {
      inserts.push({
        channel: c.channel, channel_id: c.id, status: 'pending',
        payload: { event: 'overdue', target: c.target, text: m.text },
      });
    }
    notifiedLeadIds.push(...m.leadIds);
  }

  if (inserts.length > 0) await db.from('notifications').insert(inserts);
  if (notifiedLeadIds.length > 0) {
    await db.from('leads').update({ last_overdue_notified_at: now.toISOString() }).in('id', notifiedLeadIds);
  }

  return NextResponse.json({ ok: true, sent: inserts.length, leads: notifiedLeadIds.length });
}
