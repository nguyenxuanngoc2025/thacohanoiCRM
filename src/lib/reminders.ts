import { renderOverdue, type OverdueItem } from './notify-templates';

export interface OverdueLead {
  id: string;
  showroom_id: string;
  showroom_name: string;
  full_name: string | null;
  phone: string;
  assignee_name: string | null;
  next_contact_at: string;
}

export interface OverdueMessage {
  showroomId: string;
  showroomName: string;
  leadIds: string[];
  text: string;
}

/** Gom lead quá hạn theo showroom → 1 message mỗi SR. */
export function buildOverdueMessages(leads: OverdueLead[], now: Date): OverdueMessage[] {
  const byShowroom = new Map<string, OverdueLead[]>();
  for (const l of leads) {
    const arr = byShowroom.get(l.showroom_id) ?? [];
    arr.push(l);
    byShowroom.set(l.showroom_id, arr);
  }

  const out: OverdueMessage[] = [];
  for (const [showroomId, group] of byShowroom) {
    const items: OverdueItem[] = group.map((l) => ({
      fullName: l.full_name,
      phone: l.phone,
      assignee: l.assignee_name,
      overdueHours: Math.max(0, Math.round((now.getTime() - new Date(l.next_contact_at).getTime()) / 3600000)),
    }));
    out.push({
      showroomId,
      showroomName: group[0].showroom_name,
      leadIds: group.map((l) => l.id),
      text: renderOverdue(group[0].showroom_name, items),
    });
  }
  return out;
}
