import { renderOverdue, type OverdueItem } from './notify-templates';

export interface OverdueLead {
  id: string;
  // Phòng bán hàng phụ trách lead. Lead không thuộc phòng nào (null) → không có group để nhắc → bỏ qua.
  sales_team_id: string | null;
  team_name: string | null;
  full_name: string | null;
  phone: string;
  assignee_name: string | null;
  next_contact_at: string;
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
      overdueHours: Math.max(0, Math.round((now.getTime() - new Date(l.next_contact_at).getTime()) / 3600000)),
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
