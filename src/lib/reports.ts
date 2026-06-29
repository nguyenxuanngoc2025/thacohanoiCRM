import { STATUS_LABEL, type LeadStatus } from './lead-status';
import { sourcePlatform } from './source';

/** Lead tối giản cho tính toán báo cáo (lấy từ bảng leads, đã join tên brand/showroom/TVBH). */
export interface ReportLead {
  status: LeadStatus | null;
  source: string | null;
  brand_id: string;
  brand_name: string;
  model_id: string | null;
  model_name: string | null;
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
  share: number; // % tổng lead của tập (tỉ trọng)
  contacted: number;
  contactRate: number;
  following: number; // GDTD — đang theo dõi
  won: number;
  winRate: number;
  fail: number;
  failRate: number;
  overdue: number;
}

function groupBy(
  leads: ReportLead[],
  keyOf: (l: ReportLead) => string,
  labelOf: (l: ReportLead) => string,
  nowMs: number,
): GroupRow[] {
  const total = leads.length;
  const map = new Map<string, GroupRow>();
  for (const l of leads) {
    const key = keyOf(l);
    let row = map.get(key);
    if (!row) {
      row = {
        key, label: labelOf(l), leads: 0, share: 0, contacted: 0, contactRate: 0,
        following: 0, won: 0, winRate: 0, fail: 0, failRate: 0, overdue: 0,
      };
      map.set(key, row);
    }
    row.leads += 1;
    if (isContacted(l)) row.contacted += 1;
    if (l.status === 'GDTD') row.following += 1;
    if (isWon(l)) row.won += 1;
    if (isFail(l)) row.fail += 1;
    if (isOverdue(l, nowMs)) row.overdue += 1;
  }
  const rows = [...map.values()];
  for (const r of rows) {
    r.share = rate(r.leads, total);
    r.contactRate = rate(r.contacted, r.leads);
    r.winRate = rate(r.won, r.leads);
    r.failRate = rate(r.fail, r.leads);
  }
  // Nhiều lead trước; cùng số lead thì tỉ lệ chốt cao trước.
  rows.sort((a, b) => b.leads - a.leads || b.winRate - a.winRate);
  return rows;
}

export function groupBySource(leads: ReportLead[], nowMs: number): GroupRow[] {
  // Gom theo NGUỒN CHÍNH (Facebook, Zalo OA…) — fb_message/fb_comment/lead ads chỉ là chi tiết kênh.
  return groupBy(leads, (l) => l.source ? sourcePlatform(l.source) : '__none__', (l) => l.source ? sourcePlatform(l.source) : 'Không rõ nguồn', nowMs);
}

export function groupByShowroom(leads: ReportLead[], nowMs: number): GroupRow[] {
  return groupBy(leads, (l) => l.showroom_id ?? '__none__', (l) => l.showroom_name ?? 'Chưa gán showroom', nowMs);
}

export function groupByBrand(leads: ReportLead[], nowMs: number): GroupRow[] {
  return groupBy(leads, (l) => l.brand_id, (l) => l.brand_name, nowMs);
}

/** Gom theo dòng xe; lead chưa gán dòng xe gộp vào '__none__'. */
export function groupByModel(leads: ReportLead[], nowMs: number): GroupRow[] {
  return groupBy(leads, (l) => l.model_id ?? '__none__', (l) => l.model_name ?? 'Chưa gán dòng xe', nowMs);
}

/** Hiệu suất TVBH — chỉ lead đã có người phụ trách. Xếp theo ký HĐ rồi tổng lead. */
export function groupByAssignee(leads: ReportLead[], nowMs: number): GroupRow[] {
  const assigned = leads.filter((l) => l.assigned_to != null);
  const rows = groupBy(assigned, (l) => l.assigned_to as string, (l) => l.assignee_name ?? 'Không rõ', nowMs);
  rows.sort((a, b) => b.won - a.won || b.leads - a.leads);
  return rows;
}

/** Gom theo trạng thái (đủ chỉ số), giữ thứ tự pipeline; '__none__' = chưa phân loại. */
export function groupByStatus(leads: ReportLead[], nowMs: number): GroupRow[] {
  const rows = groupBy(
    leads,
    (l) => l.status ?? '__none__',
    (l) => (l.status ? STATUS_LABEL[l.status] : 'Chưa phân loại'),
    nowMs,
  );
  const order = ['__none__', ...(Object.keys(STATUS_LABEL) as LeadStatus[])];
  rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return rows;
}

/** Các chiều phân tích dùng cho tab Bảng dữ liệu. */
export type Dimension = 'showroom' | 'brand' | 'model' | 'source' | 'assignee' | 'status';

// Thứ tự khai báo = thứ tự hiện trong dropdown; 'model' đặt ngay sau 'brand' (dòng xe là cấp con của thương hiệu).
export const DIMENSION_LABEL: Record<Dimension, string> = {
  showroom: 'Showroom',
  brand: 'Thương hiệu',
  model: 'Dòng xe',
  source: 'Nguồn',
  assignee: 'Tư vấn bán hàng',
  status: 'Trạng thái',
};

export function groupByDimension(leads: ReportLead[], dim: Dimension, nowMs: number): GroupRow[] {
  switch (dim) {
    case 'showroom': return groupByShowroom(leads, nowMs);
    case 'brand': return groupByBrand(leads, nowMs);
    case 'model': return groupByModel(leads, nowMs);
    case 'source': return groupBySource(leads, nowMs);
    case 'assignee': return groupByAssignee(leads, nowMs);
    case 'status': return groupByStatus(leads, nowMs);
  }
}

// ─── Ma trận chéo Showroom × Thương hiệu ─────────────────────────────────────

export interface PivotCell {
  leads: number;
  won: number;
}

export interface PivotRow {
  key: string;
  label: string;
  cells: Record<string, PivotCell>; // theo brand_id
  total: PivotCell;
}

export interface Pivot {
  cols: { key: string; label: string }[]; // các thương hiệu
  rows: PivotRow[]; // các showroom
  colTotals: Record<string, PivotCell>;
  grandTotal: PivotCell;
}

const emptyCell = (): PivotCell => ({ leads: 0, won: 0 });

/** Khoá + nhãn của 1 lead theo chiều phân tích. */
function dimKey(l: ReportLead, dim: Dimension): [string, string] {
  switch (dim) {
    case 'showroom': return [l.showroom_id ?? '__none__', l.showroom_name ?? 'Chưa gán showroom'];
    case 'brand': return [l.brand_id, l.brand_name];
    case 'model': return [l.model_id ?? '__none__', l.model_name ?? 'Chưa gán dòng xe'];
    case 'source': return l.source ? [sourcePlatform(l.source), sourcePlatform(l.source)] : ['__none__', 'Không rõ nguồn'];
    case 'assignee': return [l.assigned_to ?? '__none__', l.assignee_name ?? 'Chưa giao'];
    case 'status': return [l.status ?? '__none__', l.status ? STATUS_LABEL[l.status] : 'Chưa phân loại'];
  }
}

/** Bảng chéo tổng quát: hàng theo rowDim, cột theo colDim; mỗi ô có số lead + ký HĐ. */
export function crossDimension(leads: ReportLead[], rowDim: Dimension, colDim: Dimension): Pivot {
  const colMap = new Map<string, string>();
  const rowMap = new Map<string, PivotRow>();
  const colTotals: Record<string, PivotCell> = {};
  const grandTotal = emptyCell();

  for (const l of leads) {
    const [cId, cLabel] = dimKey(l, colDim);
    if (!colMap.has(cId)) colMap.set(cId, cLabel);
    const [rId, rLabel] = dimKey(l, rowDim);
    let row = rowMap.get(rId);
    if (!row) {
      row = { key: rId, label: rLabel, cells: {}, total: emptyCell() };
      rowMap.set(rId, row);
    }
    if (!row.cells[cId]) row.cells[cId] = emptyCell();
    if (!colTotals[cId]) colTotals[cId] = emptyCell();
    const won = isWon(l) ? 1 : 0;
    row.cells[cId].leads += 1; row.cells[cId].won += won;
    row.total.leads += 1; row.total.won += won;
    colTotals[cId].leads += 1; colTotals[cId].won += won;
    grandTotal.leads += 1; grandTotal.won += won;
  }

  const cols = [...colMap.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => (colTotals[b.key]?.leads ?? 0) - (colTotals[a.key]?.leads ?? 0));
  const rows = [...rowMap.values()].sort((a, b) => b.total.leads - a.total.leads);
  return { cols, rows, colTotals, grandTotal };
}

/** Bảng chéo: hàng = showroom, cột = thương hiệu (dùng ở tab Tổng quan). */
export function crossShowroomBrand(leads: ReportLead[]): Pivot {
  return crossDimension(leads, 'showroom', 'brand');
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
