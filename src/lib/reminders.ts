import { renderOverdue, renderCallbackReminder, type OverdueItem, type CallbackItem } from './notify-templates';

export interface OverdueLead {
  id: string;
  // Phòng bán hàng phụ trách lead. Lead không thuộc phòng nào (null) → không có group để nhắc → bỏ qua.
  sales_team_id: string | null;
  team_name: string | null;
  full_name: string | null;
  phone: string;
  assignee_name: string | null;
  next_contact_at: string;
  // SLA vòng 1 (giờ) của công ty — dùng suy ra mốc GIAO lead: giao = next_contact_at − first_response.
  first_response_hours: number;
}

export interface OverdueMessage {
  teamId: string;
  teamName: string;
  leadIds: string[];
  text: string;
}

/** Gom lead quá hạn theo phòng bán hàng → 1 message mỗi phòng (gửi vào group của phòng). */
export function buildOverdueMessages(leads: OverdueLead[], now: Date): OverdueMessage[] {
  const byTeam = new Map<string, OverdueLead[]>();
  for (const l of leads) {
    if (!l.sales_team_id) continue; // không có phòng → không có group nhận
    const arr = byTeam.get(l.sales_team_id) ?? [];
    arr.push(l);
    byTeam.set(l.sales_team_id, arr);
  }

  const out: OverdueMessage[] = [];
  for (const [teamId, group] of byTeam) {
    const teamName = group[0].team_name?.trim() || 'Phòng bán hàng';
    const items: OverdueItem[] = group.map((l) => ({
      fullName: l.full_name,
      phone: l.phone,
      assignee: l.assignee_name,
      // Thời gian khách chờ TỪ LÚC GIAO: (nay − hạn liên hệ) + SLA vòng 1.
      // next_contact_at = lúc giao + first_response, nên cộng lại = nay − lúc giao.
      overdueMinutes: Math.max(
        0,
        Math.round((now.getTime() - new Date(l.next_contact_at).getTime()) / 60000)
          + l.first_response_hours * 60,
      ),
    }));
    out.push({
      teamId,
      teamName,
      leadIds: group.map((l) => l.id),
      text: renderOverdue(teamName, items),
    });
  }
  return out;
}

export interface CallbackLead {
  id: string;
  sales_team_id: string | null;
  team_name: string | null;
  full_name: string | null;
  phone: string;
  assignee_name: string | null;
  no_answer_count: number;
}

/** Gom lead "Chưa LH được" cần nhắc gọi lại theo phòng → 1 message mỗi phòng. */
export function buildCallbackMessages(leads: CallbackLead[]): OverdueMessage[] {
  const byTeam = new Map<string, CallbackLead[]>();
  for (const l of leads) {
    if (!l.sales_team_id) continue;
    const arr = byTeam.get(l.sales_team_id) ?? [];
    arr.push(l);
    byTeam.set(l.sales_team_id, arr);
  }

  const out: OverdueMessage[] = [];
  for (const [teamId, group] of byTeam) {
    const teamName = group[0].team_name?.trim() || 'Phòng bán hàng';
    const items: CallbackItem[] = group.map((l) => ({
      fullName: l.full_name,
      phone: l.phone,
      assignee: l.assignee_name,
      noAnswerCount: l.no_answer_count,
    }));
    out.push({
      teamId,
      teamName,
      leadIds: group.map((l) => l.id),
      text: renderCallbackReminder(teamName, items),
    });
  }
  return out;
}
