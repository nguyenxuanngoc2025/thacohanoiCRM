// Kiểu + helper thuần cho tab "Mục tiêu vs Thực hiện". Không mạng/DB.
export type ChannelCode = 'facebook' | 'google' | 'digital_other';

export const CHANNEL_LABEL: Record<ChannelCode, string> = {
  facebook: 'Facebook',
  google: 'Google',
  digital_other: 'Khác',
};

export interface KpiRow {
  showroom_name: string;
  brand_name: string;
  model_name: string;
  channel: string;
  plan_khqt: number; plan_gdtd: number; plan_khd: number; plan_ns: number;
  actual_khqt: number; actual_gdtd: number; actual_khd: number;
}

/** Tỷ lệ đạt (%), làm tròn. Chia 0 -> 0. Cho phép > 100. */
export function pct(actual: number, plan: number): number {
  if (!plan) return 0;
  return Math.round((actual / plan) * 100);
}

export interface KpiTotals {
  plan_khqt: number; plan_gdtd: number; plan_khd: number; plan_ns: number;
  actual_khqt: number; actual_gdtd: number; actual_khd: number;
}

export function rollupTotals(rows: KpiRow[]): KpiTotals {
  return rows.reduce<KpiTotals>((t, r) => ({
    plan_khqt: t.plan_khqt + r.plan_khqt,
    plan_gdtd: t.plan_gdtd + r.plan_gdtd,
    plan_khd: t.plan_khd + r.plan_khd,
    plan_ns: t.plan_ns + r.plan_ns,
    actual_khqt: t.actual_khqt + r.actual_khqt,
    actual_gdtd: t.actual_gdtd + r.actual_gdtd,
    actual_khd: t.actual_khd + r.actual_khd,
  }), { plan_khqt: 0, plan_gdtd: 0, plan_khd: 0, plan_ns: 0, actual_khqt: 0, actual_gdtd: 0, actual_khd: 0 });
}
