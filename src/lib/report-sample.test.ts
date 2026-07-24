import { describe, it, expect } from 'vitest';
import { buildSampleReport, samplePeriodOfUnit, buildSampleForUnit, unitHasSample } from './report-sample';

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

describe('unitHasSample', () => {
  it('true cho mọi timer có gửi tin', () => {
    for (const u of [
      'cron-daily-report.timer', 'cron-weekly-report.timer', 'cron-monthly-report.timer',
      'cron-reminders.timer', 'cron-roster-reminders.timer', 'cron-health-digest.timer',
    ]) expect(unitHasSample(u)).toBe(true);
  });
  it('false cho timer không gửi tin xem trước', () => {
    expect(unitHasSample('cron-watchdog.timer')).toBe(false);
    expect(unitHasSample('certbot.timer')).toBe(false);
    expect(unitHasSample('leads-export.timer')).toBe(false);
  });
});

describe('buildSampleForUnit — tin nhắc việc / lịch trực / sức khoẻ', () => {
  it('cron-reminders: 3 khối quá hạn + gọi lại + chưa phân giao, SĐT che', () => {
    const s = buildSampleForUnit('cron-reminders.timer', NOW)!;
    expect(s).toHaveLength(3);
    const all = s.map((x) => x.text).join('\n');
    expect(all).toContain('QUÁ HẠN LIÊN HỆ');
    expect(all).toContain('CẦN GỌI LẠI');
    expect(all).toContain('CHƯA PHÂN GIAO');
    expect(all).toMatch(/\*{3}/); // SĐT được che
  });
  it('cron-roster-reminders: 1 khối nhắc đặt lịch trực ngày mai (21/07)', () => {
    const s = buildSampleForUnit('cron-roster-reminders.timer', NOW)!;
    expect(s).toHaveLength(1);
    expect(s[0].text).toContain('NHẮC LỊCH TRỰC');
    expect(s[0].text).toContain('21/07/2026');
  });
  it('cron-health-digest: 1 khối báo sức khoẻ, có mục cần chú ý', () => {
    const s = buildSampleForUnit('cron-health-digest.timer', NOW)!;
    expect(s).toHaveLength(1);
    expect(s[0].text).toContain('CẦN CHÚ Ý');
    expect(s[0].text).toContain('Thaco Auto Hà Nội');
  });
  it('timer không gửi tin → null', () => {
    expect(buildSampleForUnit('cron-watchdog.timer', NOW)).toBeNull();
  });
});
