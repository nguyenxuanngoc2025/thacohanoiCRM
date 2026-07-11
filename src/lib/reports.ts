import { STATUS_LABEL, type LeadStatus } from './lead-status';
import { sourcePlatform } from './source';
import { bestB10Status } from './b10';

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
  sales_team_id: string | null;
  team_name: string | null;
  created_at: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  fail_reason: string | null;
  b10_status: LeadStatus | null;
  b10_on: boolean;
}

/**
 * TRẠNG THÁI CUỐI CÙNG dùng cho báo cáo: lấy kết quả TỐI ƯU HƠN (rank cao hơn, không tụt hạng)
 * giữa trạng thái TVBH nhập trên app và trạng thái B10. Mọi chỉ số trạng thái của báo cáo (phân
 * loại/phễu/chốt/loại) dựa vào đây để phản ánh đúng kết quả thực tế của khách khi có cả 2 nguồn.
 */
export const effectiveStatus = (l: ReportLead): LeadStatus | null => bestB10Status(l.status, l.b10_status);

export const isWon = (l: ReportLead): boolean => effectiveStatus(l) === 'KHĐ';
export const isFail = (l: ReportLead): boolean => effectiveStatus(l) === 'Fail';
export const isContacted = (l: ReportLead): boolean => l.last_contact_at != null;
/** Còn trong pipeline: chưa chốt (KHĐ) và chưa loại (Fail). */
export const isOpen = (l: ReportLead): boolean => { const s = effectiveStatus(l); return s !== 'KHĐ' && s !== 'Fail'; };

/** Quá hạn liên hệ: còn mở + có hẹn liên hệ + hẹn đã trôi qua. */
export function isOverdue(l: ReportLead, nowMs: number): boolean {
  return isOpen(l) && l.next_contact_at != null && new Date(l.next_contact_at).getTime() < nowMs;
}

const rate = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export interface Kpis {
  total: number;
  contacted: number;
  contactRate: number;
  interested: number; // KHQT — khách quan tâm
  following: number; // GDTD — đang theo dõi giao dịch
  won: number; // KHĐ — ký hợp đồng
  winRate: number;
  overdue: number;
  fail: number;
  failRate: number;
  b10On: number; // số lead đã lên B10
  b10Rate: number; // % lead lên B10
  b10Interested: number; // KHQT trên B10
  b10Following: number; // GDTD trên B10
  b10Won: number; // KHĐ trên B10
  b10Loai: number; // Fail (loại) trên B10
}

export function computeKpis(leads: ReportLead[], nowMs: number): Kpis {
  const total = leads.length;
  const contacted = leads.filter(isContacted).length;
  const interested = leads.filter((l) => effectiveStatus(l) === 'KHQT').length;
  const following = leads.filter((l) => effectiveStatus(l) === 'GDTD').length;
  const won = leads.filter(isWon).length;
  const fail = leads.filter(isFail).length;
  const overdue = leads.filter((l) => isOverdue(l, nowMs)).length;
  const b10On = leads.filter((l) => l.b10_on).length;
  const b10Interested = leads.filter((l) => l.b10_status === 'KHQT').length;
  const b10Following = leads.filter((l) => l.b10_status === 'GDTD').length;
  const b10Won = leads.filter((l) => l.b10_status === 'KHĐ').length;
  const b10Loai = leads.filter((l) => l.b10_status === 'Fail').length;
  return {
    total,
    contacted,
    contactRate: rate(contacted, total),
    interested,
    following,
    won,
    winRate: rate(won, total),
    overdue,
    fail,
    failRate: rate(fail, total),
    b10On,
    b10Rate: rate(b10On, total),
    b10Interested,
    b10Following,
    b10Won,
    b10Loai,
  };
}

export interface KpiComparison {
  current: Kpis;
  previous: Kpis;
  delta: Record<keyof Kpis, number>; // current - previous cho từng chỉ số
}

/** KPI 2 kỳ + delta tuyệt đối từng chỉ số. Dùng cho mũi tên ↑↓ trên dải KPI. */
export function compareKpis(current: ReportLead[], previous: ReportLead[], nowMs: number): KpiComparison {
  const cur = computeKpis(current, nowMs);
  const prev = computeKpis(previous, nowMs);
  const delta = {} as Record<keyof Kpis, number>;
  (Object.keys(cur) as (keyof Kpis)[]).forEach((k) => { delta[k] = Math.round((cur[k] - prev[k]) * 10) / 10; });
  return { current: cur, previous: prev, delta };
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
  const interestedUp = leads.filter((l) => { const s = effectiveStatus(l); return s === 'KHQT' || s === 'GDTD' || s === 'KHĐ'; }).length;
  const dealingUp = leads.filter((l) => { const s = effectiveStatus(l); return s === 'GDTD' || s === 'KHĐ'; }).length;
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
  interested: number; // KHQT — khách quan tâm
  following: number; // GDTD — đang theo dõi
  won: number;
  winRate: number;
  fail: number;
  failRate: number;
  overdue: number;
  b10On: number;
  b10Rate: number;
  b10Interested: number;
  b10Following: number;
  b10Won: number;
  b10Loai: number;
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
        interested: 0, following: 0, won: 0, winRate: 0, fail: 0, failRate: 0, overdue: 0,
        b10On: 0, b10Rate: 0, b10Interested: 0, b10Following: 0, b10Won: 0, b10Loai: 0,
      };
      map.set(key, row);
    }
    row.leads += 1;
    if (isContacted(l)) row.contacted += 1;
    const es = effectiveStatus(l);
    if (es === 'KHQT') row.interested += 1;
    if (es === 'GDTD') row.following += 1;
    if (isWon(l)) row.won += 1;
    if (isFail(l)) row.fail += 1;
    if (isOverdue(l, nowMs)) row.overdue += 1;
    if (l.b10_on) row.b10On += 1;
    if (l.b10_status === 'KHQT') row.b10Interested += 1;
    if (l.b10_status === 'GDTD') row.b10Following += 1;
    if (l.b10_status === 'KHĐ') row.b10Won += 1;
    if (l.b10_status === 'Fail') row.b10Loai += 1;
  }
  const rows = [...map.values()];
  for (const r of rows) {
    r.share = rate(r.leads, total);
    r.contactRate = rate(r.contacted, r.leads);
    r.winRate = rate(r.won, r.leads);
    r.failRate = rate(r.fail, r.leads);
    r.b10Rate = rate(r.b10On, r.leads);
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

/** Gom theo phòng bán hàng; lead chưa gán phòng gộp vào '__none__'. */
export function groupByTeam(leads: ReportLead[], nowMs: number): GroupRow[] {
  return groupBy(leads, (l) => l.sales_team_id ?? '__none__', (l) => l.team_name ?? 'Chưa gán phòng', nowMs);
}

/** Gom theo trạng thái (đủ chỉ số), giữ thứ tự pipeline; '__none__' = chưa phân loại. */
export function groupByStatus(leads: ReportLead[], nowMs: number): GroupRow[] {
  const rows = groupBy(
    leads,
    (l) => effectiveStatus(l) ?? '__none__',
    (l) => { const s = effectiveStatus(l); return s ? STATUS_LABEL[s] : 'Chưa phân loại'; },
    nowMs,
  );
  const order = ['__none__', ...(Object.keys(STATUS_LABEL) as LeadStatus[])];
  rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return rows;
}

/** Các chiều phân tích dùng cho tab Bảng dữ liệu. */
export type Dimension = 'showroom' | 'brand' | 'team' | 'model' | 'source' | 'assignee' | 'status';

// Thứ tự khai báo = thứ tự hiện trong dropdown; 'model' đặt ngay sau 'brand' (dòng xe là cấp con của thương hiệu).
export const DIMENSION_LABEL: Record<Dimension, string> = {
  showroom: 'Showroom',
  brand: 'Thương hiệu',
  team: 'Phòng bán hàng',
  model: 'Dòng xe',
  source: 'Nguồn',
  assignee: 'Tư vấn bán hàng',
  status: 'Trạng thái',
};

/** Cấp báo cáo — suy từ vai trò. RLS đã giới hạn dữ liệu; cấp chỉ điều khiển TRÌNH BÀY. */
export type ReportLevel = 'company' | 'brand' | 'showroom' | 'team' | 'personal';

/** Chiều "cấp ngay dưới" để so sánh/xếp hạng. personal không xếp hạng đồng nghiệp. */
export function childDimension(level: ReportLevel): Dimension | null {
  switch (level) {
    case 'company': return 'showroom';
    case 'brand': return 'showroom';
    case 'showroom': return 'team';
    case 'team': return 'assignee';
    case 'personal': return null;
  }
}

export function groupByDimension(leads: ReportLead[], dim: Dimension, nowMs: number): GroupRow[] {
  switch (dim) {
    case 'showroom': return groupByShowroom(leads, nowMs);
    case 'brand': return groupByBrand(leads, nowMs);
    case 'team': return groupByTeam(leads, nowMs);
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
    case 'team': return [l.sales_team_id ?? '__none__', l.team_name ?? 'Chưa gán phòng'];
    case 'model': return [l.model_id ?? '__none__', l.model_name ?? 'Chưa gán dòng xe'];
    case 'source': return l.source ? [sourcePlatform(l.source), sourcePlatform(l.source)] : ['__none__', 'Không rõ nguồn'];
    case 'assignee': return [l.assigned_to ?? '__none__', l.assignee_name ?? 'Chưa giao'];
    case 'status': { const s = effectiveStatus(l); return [s ?? '__none__', s ? STATUS_LABEL[s] : 'Chưa phân loại']; }
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
    const c = effectiveStatus(l) ?? '__none__';
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return order.map((o) => ({ ...o, count: counts.get(o.code) ?? 0 })).filter((s) => s.count > 0);
}
