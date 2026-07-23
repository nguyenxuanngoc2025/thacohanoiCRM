import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { vnDateStr } from '@/lib/roster';
import { fmtRosterDate, pickShowroomsMissingRoster, buildRosterReminderText, type RosterShowroom } from '@/lib/roster-reminders';
import { resolvePushRecipients, type PushUser } from '@/lib/push-recipients';
import { sendPushToUsers } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Nhắc BLĐ showroom (chia lead theo lịch trực) đặt lịch trực cho NGÀY KẾ TIẾP nếu chưa đặt.
// Chạy chiều tối (giờ VN) để nhắc trước khi ngày mai không có phòng nhận lead. Đa tenant.
export async function POST(request: NextRequest) {
  if (!checkCronSecret(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = createServiceClient();
  const now = new Date();
  const tomorrow = vnDateStr(new Date(now.getTime() + 86400000));
  const tomorrowLabel = fmtRosterDate(tomorrow);

  // Showroom đang bật + chia lead theo lịch trực.
  const { data: srRows, error } = await db
    .from('showrooms')
    .select('id, name, company_id')
    .eq('team_assign_strategy', 'day_roster')
    .eq('is_active', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const showrooms = (srRows ?? []) as { id: string; name: string; company_id: string | null }[];
  if (showrooms.length === 0) return NextResponse.json({ ok: true, missing: 0 });

  // Các showroom ĐÃ đặt lịch trực ngày mai (sales_team_id KHÁC null).
  const { data: rosterRows } = await db
    .from('showroom_day_roster')
    .select('showroom_id, sales_team_id')
    .eq('roster_date', tomorrow)
    .in('showroom_id', showrooms.map((s) => s.id));
  const rosteredIds = new Set(
    ((rosterRows ?? []) as { showroom_id: string; sales_team_id: string | null }[])
      .filter((r) => r.sales_team_id != null)
      .map((r) => r.showroom_id),
  );

  const missing = pickShowroomsMissingRoster(
    showrooms.map((s) => ({ id: s.id, name: s.name }) as RosterShowroom),
    rosteredIds,
  );
  if (missing.length === 0) return NextResponse.json({ ok: true, missing: 0 });

  const cidBySr = new Map(showrooms.map((s) => [s.id, s.company_id]));

  // Kênh Zalo BLĐ theo showroom (scope='management', gắn showroom_id).
  const { data: channels } = await db
    .from('notification_channels')
    .select('id, channel, target, showroom_id, scope, company_id')
    .eq('is_active', true);

  const inserts: Record<string, unknown>[] = [];
  for (const sr of missing) {
    const text = buildRosterReminderText(sr.name, tomorrowLabel);
    const targets = (channels ?? []).filter(
      (c) => c.scope === 'management' && c.showroom_id === sr.id,
    );
    for (const c of targets) {
      inserts.push({
        channel: c.channel, channel_id: c.id, status: 'pending',
        payload: { event: 'roster_missing', target: c.target, text },
      });
    }
  }
  if (inserts.length > 0) await db.from('notifications').insert(inserts);

  // Web Push cá nhân tới GĐ showroom của các showroom còn thiếu lịch (đa tenant).
  const pushCompanyIds = [...new Set(missing.map((s) => cidBySr.get(s.id)).filter(Boolean))] as string[];
  if (pushCompanyIds.length > 0) {
    const [{ data: uRows }, { data: usRows }] = await Promise.all([
      db.from('users').select('id, role, company_id, sales_team_id').in('company_id', pushCompanyIds),
      db.from('user_showrooms').select('user_id, showroom_id'),
    ]);
    const srByUser = new Map<string, string[]>();
    for (const r of (usRows ?? []) as { user_id: string; showroom_id: string }[]) {
      const arr = srByUser.get(r.user_id) ?? []; arr.push(r.showroom_id); srByUser.set(r.user_id, arr);
    }
    const allUsers: PushUser[] = ((uRows ?? []) as { id: string; role: string; company_id: string | null; sales_team_id: string | null }[])
      .map((u) => ({ ...u, showroom_ids: srByUser.get(u.id) ?? [] }));

    for (const sr of missing) {
      const cid = cidBySr.get(sr.id);
      if (!cid) continue;
      const ids = resolvePushRecipients('roster_missing', {
        company_id: cid, sales_team_id: null, showroom_id: sr.id, assignee_id: null,
      }, allUsers.filter((u) => u.company_id === cid));
      await sendPushToUsers(db, cid, ids, {
        title: 'Chưa đặt lịch trực ngày mai',
        body: `Showroom ${sr.name} chưa có phòng trực ngày ${tomorrowLabel}`,
        url: '/phan-giao', tag: `roster-${sr.id}-${tomorrow}`,
      });
    }
  }

  return NextResponse.json({ ok: true, missing: missing.length, sent: inserts.length });
}
