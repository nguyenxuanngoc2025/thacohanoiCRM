import { describe, it, expect } from 'vitest';
import { buildSampleReport, samplePeriodOfUnit } from './report-sample';

const NOW = new Date('2026-07-20T04:00:00Z'); // 11:00 giờ VN, thứ 2

describe('samplePeriodOfUnit', () => {
  it('map đúng 3 timer báo cáo', () => {
    expect(samplePeriodOfUnit('cron-daily-report.timer')).toBe('daily');
    expect(samplePeriodOfUnit('cron-weekly-report.timer')).toBe('weekly');
    expect(samplePeriodOfUnit('cron-monthly-report.timer')).toBe('monthly');
  });
  it('trả null cho timer không phải báo cáo', () => {
    expect(samplePeriodOfUnit('cron-watchdog.timer')).toBeNull();
    expect(samplePeriodOfUnit('certbot.timer')).toBeNull();
  });
});

describe('buildSampleReport — tin NGÀY', () => {
  const s = buildSampleReport('daily', NOW);
  it('có 3 khối: phòng bán hàng, BLĐ showroom, BLĐ công ty', () => {
    expect(s).toHaveLength(3);
    expect(s[0].label).toContain('phòng bán hàng');
    expect(s[2].label).toContain('công ty');
  });
  it('tin ngày có nhãn NGÀY và số liệu quá hạn', () => {
    expect(s[0].text).toContain('Ngày 20/07');
    expect(s.some((x) => /[Qq]uá hạn/.test(x.text))).toBe(true);
  });
});

describe('buildSampleReport — tin TUẦN/THÁNG', () => {
  it('tuần: 3 khối (phòng bán hàng + BLĐ), nhãn TUẦN, có KHĐ + so kỳ trước, KHÔNG quá hạn', () => {
    const s = buildSampleReport('weekly', NOW);
    expect(s).toHaveLength(3);
    expect(s[0].label).toContain('phòng bán hàng');
    const all = s.map((x) => x.text).join('\n');
    expect(all).toContain('Tuần 13/07–19/07');
    expect(all).toContain('Tổng Lead');
    expect(all).toContain('KHĐ');
    expect(all).toContain('Kỳ trước');
    expect(all).not.toContain('Quá hạn');
    expect(all).not.toContain('Chưa tuân thủ');
  });
  it('tháng: nhãn THÁNG kỳ hiện tại + kỳ trước', () => {
    const s = buildSampleReport('monthly', NOW);
    const all = s.map((x) => x.text).join('\n');
    expect(all).toContain('Tháng 06/2026');
    expect(all).toContain('THÁNG 05/2026');
  });
});
