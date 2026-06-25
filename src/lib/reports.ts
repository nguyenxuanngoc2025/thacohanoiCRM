import { STATUS_LABEL, type LeadStatus } from './lead-status';

/** Lead tối giản cho tính toán báo cáo (lấy từ bảng leads, đã join tên brand/showroom/TVBH). */
export interface ReportLead {
  status: LeadStatus | null;
  source: string | null;
  brand_id: string;
  brand_name: string;
  showroom_id: string | null;
  showroom_name: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  created_at: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  fail_reason: string | null;
}

export const isWon = (l: ReportLead): boolean => l.status === 'KHĐ';
export const isFail = (l: ReportLead): boolean => l.status === 'Fail';
export const isContacted = (l: ReportLead): boolean => l.last_contact_at != null;
/** Còn trong pipeline: chưa chốt (KHĐ) và chưa loại (Fail). */
export const isOpen = (l: ReportLead): boolean => l.status !== 'KHĐ' && l.status !== 'Fail';

/** Quá hạn liên hệ: còn mở + có hẹn liên hệ + hẹn đã trôi qua. */
export function isOverdue(l: ReportLead, nowMs: number): boolean {
  return isOpen(l) && l.next_contact_at != null && new Date(l.next_contact_at).getTime() < nowMs;
}

const rate = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export interface Kpis {
  total: number;
  contacted: number;
  contactRate: number;
  following: number; // GDTD — đang theo dõi giao dịch
  won: number; // KHĐ — ký hợp đồng
  winRate: number;
  overdue: number;
  fail: number;
  failRate: number;
}

export function computeKpis(leads: ReportLead[], nowMs: number): Kpis {
  const total = leads.length;
  const contacted = leads.filter(isContacted).length;
  const following = leads.filter((l) => l.status === 'GDTD').length;
  const won = leads.filter(isWon).length;
  const fail = leads.filter(isFail).length;
  const overdue = leads.filter((l) => isOverdue(l, nowMs)).length;
  return {
    total,
    contacted,
    contactRate: rate(contacted, total),
    following,
    won,
    winRate: rate(won, total),
    overdue,
    fail,
    failRate: rate(fail, total),
  };
}

export interface FunnelStage {
  label: string;
  count: number;
  pct: number; // % trên tổng lead
}

/** Phễu lũy tiến (giảm dần): mỗi bậc bao trùm bậc sau nên luôn ≥ bậc kế. */
export function computeFunnel(leads: ReportLead[]): FunnelStage[] {
  const total = leads.length;
  const contacted = leads.filter(isContacted).length;
  const interestedUp = leads.filter((l) => l.status === 'KHQT' || l.status === 'GDTD' || l.status === 'KHĐ').length;
  const dealingUp = leads.filter((l) => l.status === 'GDTD' || l.status === 'KHĐ').length;
  const won = leads.filter(isWon).length;
  const mk = (label: string, count: number): FunnelStage => ({ label, count, pct: rate(count, total) });
  return [
    mk('Tổng lead', total),
    mk('Đã liên hệ', contacted),
    mk('Quan tâm trở lên', interestedUp),
    mk('Đang giao dịch trở lên', dealingUp),
    mk('Ký hợp đồng', won),
  ];
}

export interface GroupRow {
  key: string;
  label: string;
  leads: number;
  contacted: number;
  won: number;
  winRate: number;
}

function groupBy(
  leads: ReportLead[],
  keyOf: (l: ReportLead) => string,
  labelOf: (l: ReportLead) => string,
): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const l of leads) {
    const key = keyOf(l);
    let row = map.get(key);
    if (!row) {
      row = { key, label: labelOf(l), leads: 0, contacted: 0, won: 0, winRate: 0 };
      map.set(key, row);
    }
    row.leads += 1;
    if (isContacted(l)) row.contacted += 1;
    if (isWon(l)) row.won += 1;
  }
  const rows = [...map.values()];
  for (const r of rows) r.winRate = rate(r.won, r.leads);
  // Nhiều lead trước; cùng số lead thì tỉ lệ chốt cao trước.
  rows.sort((a, b) => b.leads - a.leads || b.winRate - a.winRate);
  return rows;
}

export function groupBySource(leads: ReportLead[]): GroupRow[] {
  return groupBy(leads, (l) => l.source ?? '__none__', (l) => l.source ?? 'Không rõ nguồn');
}

export function groupByShowroom(leads: ReportLead[]): GroupRow[] {
  return groupBy(leads, (l) => l.showroom_id ?? '__none__', (l) => l.showroom_name ?? 'Chưa gán showroom');
}

export function groupByBrand(leads: ReportLead[]): GroupRow[] {
  return groupBy(leads, (l) => l.brand_id, (l) => l.brand_name);
}

/** Hiệu suất TVBH — chỉ lead đã có người phụ trách. Xếp theo ký HĐ rồi tổng lead. */
export function groupByAssignee(leads: ReportLead[]): GroupRow[] {
  const assigned = leads.filter((l) => l.assigned_to != null);
  const rows = groupBy(assigned, (l) => l.assigned_to as string, (l) => l.assignee_name ?? 'Không rõ');
  rows.sort((a, b) => b.won - a.won || b.leads - a.leads);
  return rows;
}

export interface DayCount {
  date: string; // YYYY-MM-DD
  count: number;
}

/** Số lead mới mỗi ngày trong [fromMs, toMs] (mọi ngày đều có, kể cả 0). */
export function dailyTrend(leads: ReportLead[], fromMs: number, toMs: number): DayCount[] {
  const counts = new Map<string, number>();
  for (const l of leads) {
    const d = l.created_at.slice(0, 10);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const out: DayCount[] = [];
  const DAY = 86400000;
  for (let t = startOfDay(fromMs); t <= toMs; t += DAY) {
    const d = new Date(t).toISOString().slice(0, 10);
    out.push({ date: d, count: counts.get(d) ?? 0 });
  }
  return out;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface ReasonCount {
  reason: string;
  count: number;
}

export function failReasons(leads: ReportLead[]): ReasonCount[] {
  const map = new Map<string, number>();
  for (const l of leads) {
    if (!isFail(l)) continue;
    const r = l.fail_reason ?? 'Không ghi lý do';
    map.set(r, (map.get(r) ?? 0) + 1);
  }
  return [...map.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

export interface StatusSlice {
  code: string;
  label: string;
  count: number;
}

/** Phân bổ theo trạng thái hiện tại, gồm cả lead chưa phân loại (status NULL). */
export function statusDistribution(leads: ReportLead[]): StatusSlice[] {
  const order: { code: string; label: string }[] = [
    { code: '__none__', label: 'Chưa phân loại' },
    ...(Object.keys(STATUS_LABEL) as LeadStatus[]).map((c) => ({ code: c, label: STATUS_LABEL[c] })),
  ];
  const counts = new Map<string, number>();
  for (const l of leads) {
    const c = l.status ?? '__none__';
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return order.map((o) => ({ ...o, count: counts.get(o.code) ?? 0 })).filter((s) => s.count > 0);
}
