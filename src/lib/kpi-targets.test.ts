import { describe, it, expect } from 'vitest';
import {
  CHANNEL_LABEL, pct, rollupTotals, budgetValue, groupKpiRows, kpiDimValue,
  type KpiRow,
} from './kpi-targets';

const row = (o: Partial<KpiRow>): KpiRow => ({
  showroom_name: 'Giải Phóng', brand_name: 'KIA', model_name: 'Sportage', channel: 'facebook',
  plan_khqt: 0, plan_gdtd: 0, plan_khd: 0, plan_ns: 0, actual_ns: 0,
  actual_khqt: 0, actual_gdtd: 0, actual_khd: 0, ...o,
});

const rows: KpiRow[] = [
  row({ channel: 'facebook', plan_khqt: 100, plan_gdtd: 40, plan_khd: 10, plan_ns: 5000000, actual_ns: 4800000, actual_khqt: 80, actual_gdtd: 30, actual_khd: 8 }),
  row({ channel: 'google', plan_khqt: 50, plan_gdtd: 20, plan_khd: 5, plan_ns: 2000000, actual_ns: 0, actual_khqt: 60, actual_gdtd: 25, actual_khd: 6 }),
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

  it('rollupTotals cộng plan + actual + ngân sách', () => {
    const t = rollupTotals(rows);
    expect(t.plan_khqt).toBe(150);
    expect(t.actual_khqt).toBe(140);
    expect(t.plan_ns).toBe(7000000);
    expect(t.actual_ns).toBe(4800000);
    expect(t.actual_khd).toBe(14);
  });

  it('budgetValue: có thực chi lấy thực chi, không thì lấy kế hoạch', () => {
    expect(budgetValue(rollupTotals([rows[0]]))).toBe(4800000); // có actual_ns
    expect(budgetValue(rollupTotals([rows[1]]))).toBe(2000000); // actual_ns = 0 -> plan_ns
  });

  it('kpiDimValue: model key gồm brand để tránh trùng tên', () => {
    expect(kpiDimValue(rows[0], 'model')).toEqual(['KIA||Sportage', 'Sportage']);
    expect(kpiDimValue(rows[0], 'channel')).toEqual(['facebook', 'Facebook']);
  });

  it('groupKpiRows theo channel: Facebook trước Google', () => {
    const gs = groupKpiRows(rows, 'channel');
    expect(gs.map((g) => g.label)).toEqual(['Facebook', 'Google']);
    expect(gs[0].totals.plan_khqt).toBe(100);
  });

  it('groupKpiRows theo model: tuân thủ modelOrder (sort_order)', () => {
    const many: KpiRow[] = [
      row({ brand_name: 'KIA', model_name: 'Carnival' }),
      row({ brand_name: 'KIA', model_name: 'Sportage' }),
      row({ brand_name: 'KIA', model_name: 'Sonet' }),
    ];
    const order = new Map<string, number>([['Sportage', 1], ['Sonet', 2], ['Carnival', 3]]);
    const gs = groupKpiRows(many, 'model', order);
    expect(gs.map((g) => g.label)).toEqual(['Sportage', 'Sonet', 'Carnival']);
  });

  it('groupKpiRows theo showroom: gộp đúng + cộng dồn', () => {
    const two: KpiRow[] = [
      row({ showroom_name: 'A', actual_khqt: 5 }),
      row({ showroom_name: 'A', actual_khqt: 3 }),
      row({ showroom_name: 'B', actual_khqt: 2 }),
    ];
    const gs = groupKpiRows(two, 'showroom');
    expect(gs.map((g) => g.label)).toEqual(['A', 'B']);
    expect(gs[0].totals.actual_khqt).toBe(8);
  });
});
