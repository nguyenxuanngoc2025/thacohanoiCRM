import { describe, it, expect } from 'vitest';
import { fmtRosterDate, pickShowroomsMissingRoster, buildRosterReminderText } from './roster-reminders';

describe('fmtRosterDate', () => {
  it('đổi YYYY-MM-DD sang DD/MM/YYYY', () => {
    expect(fmtRosterDate('2026-07-24')).toBe('24/07/2026');
  });
  it('chuỗi hỏng → trả nguyên', () => {
    expect(fmtRosterDate('')).toBe('');
    expect(fmtRosterDate('abc')).toBe('abc');
  });
});

describe('pickShowroomsMissingRoster', () => {
  const srs = [
    { id: 'S1', name: 'Showroom A' },
    { id: 'S2', name: 'Showroom B' },
    { id: 'S3', name: 'Showroom C' },
  ];
  it('trả về showroom CHƯA có trong tập đã đặt lịch', () => {
    const missing = pickShowroomsMissingRoster(srs, new Set(['S2']));
    expect(missing.map((s) => s.id)).toEqual(['S1', 'S3']);
  });
  it('đã đặt hết → mảng rỗng', () => {
    expect(pickShowroomsMissingRoster(srs, new Set(['S1', 'S2', 'S3']))).toEqual([]);
  });
  it('chưa đặt gì → tất cả', () => {
    expect(pickShowroomsMissingRoster(srs, new Set()).map((s) => s.id)).toEqual(['S1', 'S2', 'S3']);
  });
});

describe('buildRosterReminderText', () => {
  it('nêu tên showroom + ngày mai + hướng dẫn Phân giao', () => {
    const t = buildRosterReminderText('Kia Long Biên', '24/07/2026');
    expect(t).toContain('Kia Long Biên');
    expect(t).toContain('24/07/2026');
    expect(t).toContain('Phân giao');
  });
});
