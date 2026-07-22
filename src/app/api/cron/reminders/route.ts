import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { buildOverdueMessages, buildCallbackMessages, type OverdueLead, type CallbackLead } from '@/lib/reminders';
import { decideOverdueAction, decideCallbackReminder, MAX_NO_ANSWER } from '@/lib/overdue-escalation';
import { getMutedTeamIdsGlobal } from '@/lib/company-brands';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!checkCronSecret(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = createServiceClient();
  const now = new Date();

  // Khoảng cách giữa 2 lần nhắc lấy từ cấu hình thời hạn liên hệ (round 1).
  const { data: sla } = await db.from('sla_config')
    .select('follow_up_hours').eq('round', 1).eq('is_active', true).maybeSingle();
  const gapHours = Math.max(0, Number(sla?.follow_up_hours ?? 2));

  // SLA vòng 1 THEO TỪNG CÔNG TY (cron chạy đa tenant) → suy ra mốc giao lead để tính
  // thời gian khách đã chờ. next_contact_at = lúc giao + first_response_hours.
  const { data: slaRows } = await db.from('sla_config')
    .select('company_id, first_response_hours').eq('round', 1).eq('is_active', true);
  const frByCompany = new Map<string, number>();
  for (const r of slaRows ?? []) {
    frByCompany.set(r.company_id as string, Math.max(0, Number(r.first_response_hours ?? 0)));
  }

  // Lead quá hạn (thống nhất với isLeadOverdue): ĐÃ giao TVBH + CHƯA chuyển trạng thái
  // + tới/quá hạn SLA. Đã chuyển trạng thái → thoát quá hạn. Chưa giao → chưa tính hạn.
  // Thêm điều kiện chưa nhắc đủ 2 lần.
  const { data: leads, error } = await db
    .from('leads')
    .select('id, company_id, sales_team_id, full_name, phone, assigned_to, next_contact_at, overdue_reminder_count, last_overdue_notified_at, sales_teams(name), users!assigned_to(full_name)')
    .lte('next_contact_at', now.toISOString())
    .is('status', null)
    .not('assigned_to', 'is', null)
    .not('sales_team_id', 'is', null)
    .lt('overdue_reminder_count', 2);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Chỉ giữ lead cần nhắc lần này (theo escalation: tối đa 2 lần, lần 2 cách lần 1 >= gapHours).
  const due = (leads ?? []).filter((l) => decideOverdueAction({
    count: l.overdue_reminder_count ?? 0,
    nextContactAt: l.next_contact_at as string,
    lastNotifiedAt: l.last_overdue_notified_at as string | null,
    gapHours,
  }, now).notify);

  const mapped: OverdueLead[] = due.map((l) => {
    const j = l as unknown as { sales_teams: { name: string } | null; users: { full_name: string } | null };
    return {
      id: l.id,
      sales_team_id: (l.sales_team_id as string | null) ?? null,
      team_name: j.sales_teams?.name ?? null,
      full_name: l.full_name ?? null,
      phone: l.phone,
      assignee_name: j.users?.full_name ?? null,
      next_contact_at: l.next_contact_at as string,
      first_response_hours: frByCompany.get(l.company_id as string) ?? 0,
    };
  });

  const messagesA = buildOverdueMessages(mapped, now);

  // Nhóm B: lead 'Chưa LH được' cần nhắc GỌI LẠI. Nhắc lặp mỗi gapHours cho tới khi TVBH đổi
  // phân loại (lead rời truy vấn) hoặc số lần gọi hụt đạt ngưỡng MAX_NO_ANSWER.
  const { data: cbLeads } = await db
    .from('leads')
    .select('id, sales_team_id, full_name, phone, no_answer_count, next_contact_at, last_overdue_notified_at, sales_teams(name), users!assigned_to(full_name)')
    .eq('status', 'Chưa LH được')
    .lte('next_contact_at', now.toISOString())
    .not('assigned_to', 'is', null)
    .not('sales_team_id', 'is', null)
    .lt('no_answer_count', MAX_NO_ANSWER);

  const cbDue = (cbLeads ?? []).filter((l) => decideCallbackReminder({
    noAnswerCount: l.no_answer_count ?? 0,
    nextContactAt: l.next_contact_at as string | null,
    lastNotifiedAt: l.last_overdue_notified_at as string | null,
    gapHours,
  }, now).notify);

  const cbMapped: CallbackLead[] = cbDue.map((l) => {
    const j = l as unknown as { sales_teams: { name: string } | null; users: { full_name: string } | null };
    return {
      id: l.id,
      sales_team_id: (l.sales_team_id as string | null) ?? null,
      team_name: j.sales_teams?.name ?? null,
      full_name: l.full_name ?? null,
      phone: l.phone,
      assignee_name: j.users?.full_name ?? null,
      no_answer_count: l.no_answer_count ?? 0,
    };
  });
  const messagesB = buildCallbackMessages(cbMapped);

  const messages = [...messagesA, ...messagesB];
  if (messages.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  // Phòng thuộc hãng ĐANG TẮT (cross-company) → bỏ qua nhắc hạn cho phòng đó.
  // Team bị "tắt tiếng" nếu công ty của nó có whitelist non-empty MÀ brand của team không nằm trong.
  const mutedTeamIds = await getMutedTeamIdsGlobal(db);

  // Kênh nhóm bán hàng (theo phòng) có sự kiện 'overdue'
  const { data: channels } = await db
    .from('notification_channels')
    .select('id, channel, target, events, sales_team_id, sales_team_ids, scope')
    .eq('is_active', true);

  const inserts: Record<string, unknown>[] = [];
  const notifiedLeadIds: string[] = [];
  for (const m of messages) {
    if (m.teamId && mutedTeamIds.has(m.teamId)) continue;
    const targets = (channels ?? []).filter((c) => {
      if (!(c.events ?? []).includes('overdue') || c.scope !== 'sales') return false;
      // Kênh phủ NHIỀU phòng qua sales_team_ids[] (migration 0047); cột cũ sales_team_id
      // chỉ là phần tử đầu → phải khớp theo MẢNG, không thì phòng thứ 2+ bị bỏ nhắc.
      const ids = (c.sales_team_ids as string[] | null) ?? (c.sales_team_id ? [c.sales_team_id as string] : []);
      return m.teamId != null && ids.includes(m.teamId);
    });
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

  // Ghi tiến trình nhắc: nhóm A tăng overdue_reminder_count theo escalation.
  for (const l of due) {
    if (!notifiedLeadIds.includes(l.id)) continue;
    const a = decideOverdueAction({
      count: l.overdue_reminder_count ?? 0,
      nextContactAt: l.next_contact_at as string,
      lastNotifiedAt: l.last_overdue_notified_at as string | null,
      gapHours,
    }, now);
    await db.from('leads').update({
      overdue_reminder_count: a.nextCount, last_overdue_notified_at: now.toISOString(),
    }).eq('id', l.id);
  }
  // Nhóm B chỉ ghi mốc nhắc gần nhất (cổng chu kỳ lặp); số lần gọi hụt chỉ do TVBH tăng.
  for (const l of cbDue) {
    if (!notifiedLeadIds.includes(l.id)) continue;
    await db.from('leads').update({ last_overdue_notified_at: now.toISOString() }).eq('id', l.id);
  }

  return NextResponse.json({ ok: true, sent: inserts.length, leads: notifiedLeadIds.length });
}
