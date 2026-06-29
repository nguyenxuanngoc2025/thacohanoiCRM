import { renderDailySr, renderDailyMgmt, type DailySrStats, type MgmtRow, type NonCompliant } from './notify-templates';

export interface ReportLead {
  showroom_id: string;
  showroom_name: string;
  // Phòng bán hàng phụ trách lead (null = chưa thuộc phòng nào → không vào báo cáo nhóm bán hàng).
  sales_team_id: string | null;
  team_name: string | null;
  last_contact_at: string | null;
  next_contact_at: string | null;
  status: string | null;
  assignee_name: string | null;
}

export interface ScopedReport {
  // id = showroom_id (perShowroom) hoặc sales_team_id (perTeam)
  id: string;
  name: string;
  stats: DailySrStats;
  text: string;
}

export interface PeriodReport {
  // Báo cáo từng phòng bán hàng → gửi vào group của phòng (kênh scope='sales').
  perTeam: ScopedReport[];
  // Báo cáo từng showroom → gửi nhóm BLĐ showroom (kênh scope='management' có showroom_id).
  perShowroom: ScopedReport[];
  // Bảng tổng hợp toàn công ty → gửi nhóm BLĐ công ty (kênh scope='management' showroom_id null).
  management: string;
}

// Phòng/showroom đã cấu hình group nhận báo cáo → luôn xuất hiện trong báo cáo
// (kèm số 0 nếu kỳ này không có lead), để group đã tạo vẫn nhận báo cáo đều.
export interface ReportSeed {
  teams?: { id: string; name: string }[];
  showrooms?: { id: string; name: string }[];
}

function emptyStats(): DailySrStats {
  return { total: 0, contacted: 0, pending: 0, overdue: 0, KHQT: 0, GDTD: 0, KyHD: 0, Fail: 0 };
}

interface Bucket {
  name: string;
  stats: DailySrStats;
  overdueByAssignee: Map<string, number>;
}

function newBucket(name: string): Bucket {
  return { name, stats: emptyStats(), overdueByAssignee: new Map<string, number>() };
}

// Cộng dồn 1 lead vào bucket (showroom hoặc team). now để xác định quá hạn.
function accumulate(g: Bucket, l: ReportLead, now: Date): void {
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
}

function nonCompliantOf(g: Bucket): NonCompliant[] {
  return [...g.overdueByAssignee.entries()]
    .map(([name, overdue]) => ({ name, overdue }))
    .sort((a, b) => b.overdue - a.overdue);
}

/**
 * Từ danh sách lead trong kỳ → báo cáo 3 cấp:
 *  - perTeam: thống kê từng phòng bán hàng (chỉ lead có sales_team_id).
 *  - perShowroom: thống kê từng showroom.
 *  - management: bảng tổng hợp toàn công ty.
 * dateLabel đã gồm từ chỉ kỳ ('NGÀY 24/06' | 'TUẦN ...' | 'THÁNG ...').
 */
export function buildPeriodReport(leads: ReportLead[], dateLabel: string, now: Date, seed?: ReportSeed): PeriodReport {
  const teams = new Map<string, Bucket>();
  const showrooms = new Map<string, Bucket>();

  // Tạo sẵn bucket rỗng cho phòng/showroom đã có group → có lead thì cộng dồn,
  // không có lead vẫn ra báo cáo "0 lead" cho group đó.
  for (const t of seed?.teams ?? []) teams.set(t.id, newBucket(t.name));
  for (const s of seed?.showrooms ?? []) showrooms.set(s.id, newBucket(s.name));

  for (const l of leads) {
    const sg = showrooms.get(l.showroom_id) ?? newBucket(l.showroom_name);
    accumulate(sg, l, now);
    showrooms.set(l.showroom_id, sg);

    if (l.sales_team_id) {
      const tg = teams.get(l.sales_team_id) ?? newBucket(l.team_name?.trim() || l.showroom_name);
      accumulate(tg, l, now);
      teams.set(l.sales_team_id, tg);
    }
  }

  const perTeam: ScopedReport[] = [...teams.entries()].map(([id, g]) => ({
    id, name: g.name, stats: g.stats,
    text: renderDailySr(g.name, dateLabel, g.stats, nonCompliantOf(g)),
  }));

  const perShowroom: ScopedReport[] = [];
  const mgmtRows: MgmtRow[] = [];
  let tTotal = 0, tContacted = 0, tOverdue = 0;
  for (const [showroomId, g] of showrooms) {
    perShowroom.push({
      id: showroomId, name: g.name, stats: g.stats,
      text: renderDailySr(g.name, dateLabel, g.stats, nonCompliantOf(g)),
    });
    mgmtRows.push({
      showroom: g.name, total: g.stats.total, contacted: g.stats.contacted,
      pending: g.stats.pending, overdue: g.stats.overdue,
      contactRate: g.stats.total ? Math.round((g.stats.contacted / g.stats.total) * 100) : 0,
    });
    tTotal += g.stats.total; tContacted += g.stats.contacted; tOverdue += g.stats.overdue;
  }

  return {
    perTeam,
    perShowroom,
    management: renderDailyMgmt(dateLabel, mgmtRows, { total: tTotal, contacted: tContacted, overdue: tOverdue }),
  };
}
