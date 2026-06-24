import { renderDailySr, renderDailyMgmt, type DailySrStats, type MgmtRow, type NonCompliant } from './notify-templates';

export interface ReportLead {
  showroom_id: string;
  showroom_name: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  status: string | null;
  assignee_name: string | null;
}

export interface ShowroomReport {
  showroomId: string;
  showroomName: string;
  stats: DailySrStats;
  text: string;
}

export interface DailyReport {
  perShowroom: ShowroomReport[];
  management: string;
}

function emptyStats(): DailySrStats {
  return { total: 0, contacted: 0, pending: 0, overdue: 0, KHQT: 0, GDTD: 0, KyHD: 0, Fail: 0 };
}

/** Từ danh sách lead trong ngày → thống kê per-SR + bảng tổng hợp BLĐ. */
export function buildDailyReport(leads: ReportLead[], dateLabel: string, now: Date): DailyReport {
  // overdue: Map<showroom_id, Map<assignee_name, count>> để nêu tên TVBH chưa tuân thủ
  const groups = new Map<string, { name: string; stats: DailySrStats; overdueByAssignee: Map<string, number> }>();
  for (const l of leads) {
    const g = groups.get(l.showroom_id)
      ?? { name: l.showroom_name, stats: emptyStats(), overdueByAssignee: new Map<string, number>() };
    g.stats.total += 1;
    const contacted = l.last_contact_at != null;
    if (contacted) g.stats.contacted += 1;
    else {
      g.stats.pending += 1;
      if (l.next_contact_at && new Date(l.next_contact_at).getTime() <= now.getTime()) {
        g.stats.overdue += 1;
        const who = l.assignee_name?.trim() || 'Chưa phân';
        g.overdueByAssignee.set(who, (g.overdueByAssignee.get(who) ?? 0) + 1);
      }
    }
    if (l.status === 'KHQT') g.stats.KHQT += 1;
    else if (l.status === 'GDTD') g.stats.GDTD += 1;
    else if (l.status === 'KHĐ') g.stats.KyHD += 1;
    else if (l.status === 'Fail') g.stats.Fail += 1;
    groups.set(l.showroom_id, g);
  }

  const perShowroom: ShowroomReport[] = [];
  const mgmtRows: MgmtRow[] = [];
  let tTotal = 0, tContacted = 0, tOverdue = 0;
  for (const [showroomId, g] of groups) {
    const nonCompliant: NonCompliant[] = [...g.overdueByAssignee.entries()]
      .map(([name, overdue]) => ({ name, overdue }))
      .sort((a, b) => b.overdue - a.overdue);
    perShowroom.push({
      showroomId, showroomName: g.name, stats: g.stats,
      text: renderDailySr(g.name, dateLabel, g.stats, nonCompliant),
    });
    mgmtRows.push({
      showroom: g.name, total: g.stats.total, contacted: g.stats.contacted,
      pending: g.stats.pending, overdue: g.stats.overdue,
      contactRate: g.stats.total ? Math.round((g.stats.contacted / g.stats.total) * 100) : 0,
    });
    tTotal += g.stats.total; tContacted += g.stats.contacted; tOverdue += g.stats.overdue;
  }

  return {
    perShowroom,
    management: renderDailyMgmt(dateLabel, mgmtRows, { total: tTotal, contacted: tContacted, overdue: tOverdue }),
  };
}
