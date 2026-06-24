import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { buildDailyReport, type ReportLead } from '@/lib/daily-report';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!checkCronSecret(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = createServiceClient();
  const now = new Date();
  // Đầu ngày theo giờ VN (UTC+7): trừ 7h rồi lấy 00:00 UTC tương ứng
  const startVn = new Date(now.getTime() + 7 * 3600000);
  startVn.setUTCHours(0, 0, 0, 0);
  const startUtc = new Date(startVn.getTime() - 7 * 3600000).toISOString();
  const dateLabel = `${String(startVn.getUTCDate()).padStart(2, '0')}/${String(startVn.getUTCMonth() + 1).padStart(2, '0')}`;

  // Lead TẠO trong ngày
  const { data: leads, error } = await db
    .from('leads')
    .select('showroom_id, status, last_contact_at, next_contact_at, showrooms(name)')
    .gte('created_at', startUtc)
    .not('showroom_id', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapped: ReportLead[] = (leads ?? []).map((l) => {
    const sr = l as unknown as { showrooms: { name: string } | null };
    return {
      showroom_id: l.showroom_id as string,
      showroom_name: sr.showrooms?.name ?? 'Showroom',
      last_contact_at: l.last_contact_at ?? null,
      next_contact_at: l.next_contact_at ?? null,
      status: l.status ?? null,
    };
  });

  const report = buildDailyReport(mapped, dateLabel, now);

  const { data: channels } = await db
    .from('notification_channels')
    .select('id, channel, target, events, showroom_id, scope')
    .eq('is_active', true);

  const inserts: Record<string, unknown>[] = [];

  // Per-SR: kênh showroom có 'daily_report'
  for (const sr of report.perShowroom) {
    const targets = (channels ?? []).filter(
      (c) => (c.events ?? []).includes('daily_report') && c.scope === 'showroom' && c.showroom_id === sr.showroomId
    );
    for (const c of targets) {
      inserts.push({ channel: c.channel, channel_id: c.id, status: 'pending',
        payload: { event: 'daily_report', target: c.target, text: sr.text } });
    }
  }

  // BLĐ: kênh scope='management' có 'daily_report'
  const mgmtTargets = (channels ?? []).filter(
    (c) => (c.events ?? []).includes('daily_report') && c.scope === 'management'
  );
  for (const c of mgmtTargets) {
    inserts.push({ channel: c.channel, channel_id: c.id, status: 'pending',
      payload: { event: 'daily_report', target: c.target, text: report.management } });
  }

  if (inserts.length > 0) await db.from('notifications').insert(inserts);
  return NextResponse.json({ ok: true, sent: inserts.length });
}
