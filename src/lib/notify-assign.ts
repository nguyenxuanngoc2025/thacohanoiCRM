// Tin Zalo "đã phân giao" — bắn vào nhóm phòng khi lead được giao cho TVBH, nhắc vào chăm sóc.
// Dùng service_role (bypass RLS) để đọc kênh + chèn hàng đợi notifications, giống ingest.ts.
// Best-effort: mọi lỗi nuốt gọn để KHÔNG làm hỏng thao tác phân giao (đã ghi DB thành công trước đó).

import { createServiceClient } from '@/lib/supabase/server';
import { renderLeadAssigned, renderLeadsAssignedSummary, renderNewLead, type AssignedCount } from '@/lib/notify-templates';
import { getMutedTeamIds } from '@/lib/company-brands';
import { looksLikePersonName } from '@/lib/person-name';

type Db = ReturnType<typeof createServiceClient>;

interface SalesTarget { id: string; channel: string; target: string | null }

// Kênh sales của ĐÚNG phòng, có sự kiện new_lead (dùng lại kênh nhóm phòng như tin lead mới).
async function salesTargets(db: Db, companyId: string, teamId: string): Promise<SalesTarget[]> {
  const { data } = await db
    .from('notification_channels')
    .select('id, channel, target, events, sales_team_id, sales_team_ids, scope, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true);
  return (data ?? [])
    .filter((c) => {
      const ids = ((c as { sales_team_ids: string[] | null }).sales_team_ids) ?? (((c as { sales_team_id: string | null }).sales_team_id) ? [(c as { sales_team_id: string }).sales_team_id] : []);
      return ((c as { events: string[] | null }).events ?? []).includes('new_lead')
        && (c as { scope: string }).scope === 'sales'
        && ids.includes(teamId);
    })
    .map((c) => ({
      id: (c as { id: string }).id,
      channel: (c as { channel: string }).channel,
      target: (c as { target: string | null }).target,
    }));
}

/**
 * Tin "LEAD MỚI" cho lead tạo TAY — nhân bản đúng khối thông báo của ingest.ts (webhook),
 * để mọi lead lên app đều báo Zalo (không chỉ webhook). Định tuyến theo PHÒNG của lead.
 * Best-effort: nuốt lỗi để KHÔNG làm hỏng thao tác tạo lead (đã ghi DB thành công).
 */
export async function notifyNewLead(leadId: string): Promise<void> {
  try {
    const db = createServiceClient();

    const { data: lead } = await db
      .from('leads')
      .select('company_id, showroom_id, sales_team_id, phone, full_name, model_id, source, assigned_to, b10_status, b10_care_note')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead?.sales_team_id) return; // chưa thuộc phòng nào → không có nhóm để báo (giống ingest)

    // Gate mute: phòng thuộc hãng ĐÓNG hoặc showroom TẮT → "tắt = không báo Zalo".
    const muted = new Set(await getMutedTeamIds(db, lead.company_id));
    if (muted.has(lead.sales_team_id)) return;

    const targets = await salesTargets(db, lead.company_id, lead.sales_team_id);
    if (targets.length === 0) return;

    const showroomName = lead.showroom_id
      ? (await db.from('showrooms').select('name').eq('id', lead.showroom_id).maybeSingle()).data?.name ?? 'Showroom'
      : 'Showroom';
    const teamName = (await db.from('sales_teams').select('name').eq('id', lead.sales_team_id).maybeSingle()).data?.name ?? null;
    const modelName = lead.model_id
      ? (await db.from('models').select('name').eq('id', lead.model_id).maybeSingle()).data?.name ?? null
      : null;
    const assigneeName = lead.assigned_to
      ? (await db.from('users').select('full_name').eq('id', lead.assigned_to).maybeSingle()).data?.full_name ?? null
      : null;

    const text = renderNewLead({
      showroom: showroomName,
      team: teamName,
      fullName: lead.full_name,
      phone: lead.phone,
      source: lead.source ?? null,
      model: modelName,
      assignee: assigneeName,
      b10Prior: lead.b10_status ? { status: lead.b10_status, note: lead.b10_care_note } : null,
    });

    // Tên rác → kèm enrich để bot tra Zalo bù tên trước khi gửi.
    const enrich = !looksLikePersonName(lead.full_name)
      ? { leadId, phone: lead.phone, badName: (lead.full_name?.trim() || 'Khách lẻ') }
      : null;

    await db.from('notifications').insert(
      targets.map((c) => ({
        lead_id: leadId,
        channel: c.channel,
        channel_id: c.id,
        status: 'pending',
        payload: { event: 'new_lead', leadId, target: c.target, text, ...(enrich ? { enrich } : {}) },
      }))
    );
  } catch {
    /* best-effort: không làm hỏng thao tác tạo lead */
  }
}

/** Đơn lẻ: 1 lead vừa được giao cho 1 TVBH → tin vào nhóm phòng của TVBH đó. */
export async function notifyLeadAssigned(leadId: string, assigneeId: string): Promise<void> {
  try {
    const db = createServiceClient();

    const { data: lead } = await db
      .from('leads')
      .select('company_id, showroom_id, phone, full_name, model_id')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return;

    const { data: user } = await db
      .from('users')
      .select('full_name, sales_team_id')
      .eq('id', assigneeId)
      .maybeSingle();
    if (!user?.sales_team_id) return; // TVBH chưa gắn phòng → không có nhóm để báo

    // Gate mute: phòng thuộc hãng ĐÓNG hoặc showroom TẮT → giữ nguyên tắc "tắt = không báo Zalo".
    const muted = new Set(await getMutedTeamIds(db, lead.company_id));
    if (muted.has(user.sales_team_id)) return;

    const targets = await salesTargets(db, lead.company_id, user.sales_team_id);
    if (targets.length === 0) return;

    const showroomName = lead.showroom_id
      ? (await db.from('showrooms').select('name').eq('id', lead.showroom_id).maybeSingle()).data?.name ?? 'Showroom'
      : 'Showroom';
    const teamName = (await db.from('sales_teams').select('name').eq('id', user.sales_team_id).maybeSingle()).data?.name ?? null;
    const modelName = lead.model_id
      ? (await db.from('models').select('name').eq('id', lead.model_id).maybeSingle()).data?.name ?? null
      : null;

    const text = renderLeadAssigned({
      showroom: showroomName,
      team: teamName,
      fullName: lead.full_name,
      phone: lead.phone,
      model: modelName,
      assignee: user.full_name,
    });

    await db.from('notifications').insert(
      targets.map((c) => ({
        lead_id: leadId,
        channel: c.channel,
        channel_id: c.id,
        status: 'pending',
        payload: { event: 'lead_assigned', leadId, target: c.target, text },
      }))
    );
  } catch {
    /* best-effort: không làm hỏng thao tác phân giao */
  }
}

/**
 * Hàng loạt: gom theo phòng (của TVBH được giao) → mỗi phòng 1 tin tóm tắt, chống dội nhóm.
 * Chỉ xét cặp có assigneeId; bỏ TVBH chưa gắn phòng; gate mute theo phòng.
 */
export async function notifyLeadsAssignedBulk(
  pairs: { leadId: string; assigneeId: string | null }[]
): Promise<void> {
  try {
    const valid = pairs.filter((p): p is { leadId: string; assigneeId: string } => !!p.assigneeId);
    if (valid.length === 0) return;

    const db = createServiceClient();

    const { data: leads } = await db
      .from('leads')
      .select('id, company_id, showroom_id')
      .in('id', valid.map((p) => p.leadId));
    const leadMap = new Map(
      (leads ?? []).map((l) => [
        (l as { id: string }).id,
        l as { company_id: string; showroom_id: string | null },
      ])
    );

    const assigneeIds = [...new Set(valid.map((p) => p.assigneeId))];
    const { data: users } = await db
      .from('users')
      .select('id, full_name, sales_team_id')
      .in('id', assigneeIds);
    const userMap = new Map(
      (users ?? []).map((u) => [
        (u as { id: string }).id,
        u as { full_name: string; sales_team_id: string | null },
      ])
    );

    // Các thao tác hàng loạt chạy trong 1 công ty (RLS của caller) → lấy companyId từ lead bất kỳ.
    const companyId = leadMap.size ? [...leadMap.values()][0].company_id : null;
    if (!companyId) return;
    const muted = new Set(await getMutedTeamIds(db, companyId));

    // Gom theo phòng: teamId → { showroomId, counts: TVBH→số lead, total }
    const byTeam = new Map<string, { showroomId: string | null; counts: Map<string, number>; total: number }>();
    for (const p of valid) {
      const lead = leadMap.get(p.leadId);
      const u = userMap.get(p.assigneeId);
      if (!lead || !u?.sales_team_id) continue;
      if (muted.has(u.sales_team_id)) continue;
      const g = byTeam.get(u.sales_team_id) ?? { showroomId: lead.showroom_id, counts: new Map<string, number>(), total: 0 };
      g.counts.set(u.full_name, (g.counts.get(u.full_name) ?? 0) + 1);
      g.total += 1;
      byTeam.set(u.sales_team_id, g);
    }
    if (byTeam.size === 0) return;

    for (const [teamId, g] of byTeam) {
      const targets = await salesTargets(db, companyId, teamId);
      if (targets.length === 0) continue;

      const showroomName = g.showroomId
        ? (await db.from('showrooms').select('name').eq('id', g.showroomId).maybeSingle()).data?.name ?? 'Showroom'
        : 'Showroom';
      const perAssignee: AssignedCount[] = [...g.counts].map(([name, count]) => ({ name, count }));
      const text = renderLeadsAssignedSummary(showroomName, g.total, perAssignee);

      await db.from('notifications').insert(
        targets.map((c) => ({
          lead_id: null,
          channel: c.channel,
          channel_id: c.id,
          status: 'pending',
          payload: { event: 'lead_assigned', target: c.target, text },
        }))
      );
    }
  } catch {
    /* best-effort */
  }
}
