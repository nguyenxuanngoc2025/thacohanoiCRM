// Kiểu + helper thuần cho tab "Mục tiêu vs Thực hiện". Không mạng/DB.
export type ChannelCode = 'facebook' | 'google' | 'digital_other';

export const CHANNEL_LABEL: Record<ChannelCode, string> = {
  facebook: 'Facebook',
  google: 'Google',
  digital_other: 'Khác',
};

/** Thứ tự hiển thị kênh: Facebook → Google → Khác. */
export const CHANNEL_ORDER: ChannelCode[] = ['facebook', 'google', 'digital_other'];

export interface KpiRow {
  showroom_name: string;
  brand_name: string;
  model_name: string;
  channel: string;
  /** Mã dòng xe CRM tương ứng (để lọc theo mã, tránh vênh tên Budget↔CRM). NULL nếu dòng Budget chưa map. */
  crm_model_id?: string | null;
  /** Thứ tự LẤY TỪ BUDGET: showroom theo weight (xếp GIẢM dần), dòng xe theo master_models.sort_order (TĂNG dần). */
  showroom_sort?: number | null;
  model_sort?: number | null;
  plan_khqt: number; plan_gdtd: number; plan_khd: number; plan_ns: number; actual_ns: number;
  actual_khqt: number; actual_gdtd: number; actual_khd: number;
}

/** Tỷ lệ đạt (%), làm tròn. Chia 0 -> 0. Cho phép > 100. */
export function pct(actual: number, plan: number): number {
  if (!plan) return 0;
  return Math.round((actual / plan) * 100);
}

export interface KpiTotals {
  plan_khqt: number; plan_gdtd: number; plan_khd: number; plan_ns: number; actual_ns: number;
  actual_khqt: number; actual_gdtd: number; actual_khd: number;
}

const ZERO_TOTALS: KpiTotals = {
  plan_khqt: 0, plan_gdtd: 0, plan_khd: 0, plan_ns: 0, actual_ns: 0,
  actual_khqt: 0, actual_gdtd: 0, actual_khd: 0,
};

export function rollupTotals(rows: KpiRow[]): KpiTotals {
  return rows.reduce<KpiTotals>((t, r) => ({
    plan_khqt: t.plan_khqt + r.plan_khqt,
    plan_gdtd: t.plan_gdtd + r.plan_gdtd,
    plan_khd: t.plan_khd + r.plan_khd,
    plan_ns: t.plan_ns + r.plan_ns,
    actual_ns: t.actual_ns + r.actual_ns,
    actual_khqt: t.actual_khqt + r.actual_khqt,
    actual_gdtd: t.actual_gdtd + r.actual_gdtd,
    actual_khd: t.actual_khd + r.actual_khd,
  }), { ...ZERO_TOTALS });
}

/** Ngân sách hiển thị: có thực chi thì lấy thực chi, không thì lấy kế hoạch. */
export function budgetValue(t: KpiTotals): number {
  return t.actual_ns > 0 ? t.actual_ns : t.plan_ns;
}

// ---- Gom nhóm cho báo cáo dạng cây (giống Bảng quản trị) -----------------

export type KpiDim = 'showroom' | 'brand' | 'model' | 'channel';

/** Giá trị chiều của 1 dòng: [key gom nhóm, nhãn hiển thị]. */
export function kpiDimValue(r: KpiRow, dim: KpiDim): [string, string] {
  switch (dim) {
    case 'showroom': return [r.showroom_name, r.showroom_name];
    case 'brand':    return [r.brand_name, r.brand_name];
    case 'model':    return [`${r.brand_name}||${r.model_name}`, r.model_name];
    case 'channel':  return [r.channel, CHANNEL_LABEL[r.channel as ChannelCode] ?? r.channel];
  }
}

export interface KpiGroup {
  key: string;
  label: string;
  dim: KpiDim;
  rows: KpiRow[];
  totals: KpiTotals;
}

/**
 * Gom `rows` theo chiều `dim`. Thứ tự nhóm — LẤY TỪ BUDGET làm chuẩn:
 * - showroom: theo `showroomOrder` (rank weight giảm dần); thiếu → theo tên (locale vi);
 * - model: theo `modelOrder` (model_name -> master_models.sort_order) rồi tên;
 * - channel: Facebook → Google → Khác;
 * - brand: theo tên (locale vi).
 */
export function groupKpiRows(
  rows: KpiRow[],
  dim: KpiDim,
  modelOrder?: Map<string, number>,
  showroomOrder?: Map<string, number>,
): KpiGroup[] {
  const map = new Map<string, KpiGroup>();
  for (const r of rows) {
    const [key, label] = kpiDimValue(r, dim);
    let g = map.get(key);
    if (!g) { g = { key, label, dim, rows: [], totals: { ...ZERO_TOTALS } }; map.set(key, g); }
    g.rows.push(r);
  }
  const groups = [...map.values()].map((g) => ({ ...g, totals: rollupTotals(g.rows) }));

  if (dim === 'channel') {
    const idx = (k: string) => { const i = CHANNEL_ORDER.indexOf(k as ChannelCode); return i < 0 ? 99 : i; };
    groups.sort((a, b) => idx(a.key) - idx(b.key) || a.label.localeCompare(b.label, 'vi'));
  } else if (dim === 'model') {
    const ord = (label: string) => modelOrder?.get(label) ?? 9999;
    groups.sort((a, b) => ord(a.label) - ord(b.label) || a.label.localeCompare(b.label, 'vi'));
  } else if (dim === 'showroom' && showroomOrder) {
    const ord = (label: string) => showroomOrder.get(label) ?? 9999;
    groups.sort((a, b) => ord(a.label) - ord(b.label) || a.label.localeCompare(b.label, 'vi'));
  } else {
    groups.sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }
  return groups;
}

/** Rank showroom theo Budget: weight GIẢM dần → index 0,1,2… (dùng cho groupKpiRows). */
export function buildShowroomOrder(rows: KpiRow[]): Map<string, number> {
  const w = new Map<string, number>();
  for (const r of rows) if (r.showroom_sort != null) w.set(r.showroom_name, r.showroom_sort);
  const order = new Map<string, number>();
  [...w.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'))
    .forEach(([name], i) => order.set(name, i));
  return order;
}

/** Thứ tự dòng xe theo Budget: model_name -> master_models.sort_order. */
export function buildModelOrder(rows: KpiRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if (r.model_sort != null && !m.has(r.model_name)) m.set(r.model_name, r.model_sort);
  return m;
}
