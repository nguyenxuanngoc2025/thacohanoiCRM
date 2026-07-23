import { describe, it, expect } from 'vitest';
import { CHANNEL_LABEL, pct, rollupTotals, type KpiRow } from './kpi-targets';

const rows: KpiRow[] = [
  { showroom_name: 'Giải Phóng', brand_name: 'KIA', model_name: 'Sportage', channel: 'facebook',
    plan_khqt: 100, plan_gdtd: 40, plan_khd: 10, plan_ns: 5000000,
    actual_khqt: 80, actual_gdtd: 30, actual_khd: 8 },
  { showroom_name: 'Giải Phóng', brand_name: 'KIA', model_name: 'Sportage', channel: 'google',
    plan_khqt: 50, plan_gdtd: 20, plan_khd: 5, plan_ns: 2000000,
    actual_khqt: 60, actual_gdtd: 25, actual_khd: 6 },
];

describe('kpi-targets helper', () => {
  it('pct làm tròn tỷ lệ đạt', () => {
    expect(pct(80, 100)).toBe(80);
    expect(pct(8, 0)).toBe(0);      // chia 0 -> 0
    expect(pct(120, 100)).toBe(120); // vượt mục tiêu > 100%
  });

  it('CHANNEL_LABEL đủ 3 nhóm tiếng Việt', () => {
    expect(CHANNEL_LABEL.facebook).toBe('Facebook');
    expect(CHANNEL_LABEL.google).toBe('Google');
    expect(CHANNEL_LABEL.digital_other).toBe('Khác');
  });

  it('rollupTotals cộng plan + actual', () => {
    const t = rollupTotals(rows);
    expect(t.plan_khqt).toBe(150);
    expect(t.actual_khqt).toBe(140);
    expect(t.plan_ns).toBe(7000000);
    expect(t.actual_khd).toBe(14);
  });
});
