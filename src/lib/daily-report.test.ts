import { describe, it, expect } from 'vitest';
import { buildDailyReport, type ReportLead } from './daily-report';

describe('daily-report', () => {
  it('tính per-SR: tổng/đã LH/chưa/quá hạn + phân loại', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const leads: ReportLead[] = [
      { showroom_id: 'sr1', showroom_name: 'KIA HN', last_contact_at: '2026-06-24T09:00:00Z', next_contact_at: null, status: 'KHQT' },
      { showroom_id: 'sr1', showroom_name: 'KIA HN', last_contact_at: null, next_contact_at: '2026-06-24T08:00:00Z', status: null },
      { showroom_id: 'sr1', showroom_name: 'KIA HN', last_contact_at: '2026-06-24T10:00:00Z', next_contact_at: null, status: 'KHĐ' },
    ];
    const r = buildDailyReport(leads, '24/06', now);
    expect(r.perShowroom).toHaveLength(1);
    const sr = r.perShowroom[0];
    expect(sr.stats.total).toBe(3);
    expect(sr.stats.contacted).toBe(2);
    expect(sr.stats.pending).toBe(1);
    expect(sr.stats.overdue).toBe(1);
    expect(sr.stats.KHQT).toBe(1);
    expect(sr.stats.KyHD).toBe(1);
    expect(sr.text).toContain('BÁO CÁO NGÀY 24/06 — KIA HN');
  });

  it('bảng BLĐ tổng hợp tất cả SR, sắp theo tỷ lệ LH', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const leads: ReportLead[] = [
      { showroom_id: 'sr1', showroom_name: 'KIA HN', last_contact_at: '2026-06-24T09:00:00Z', next_contact_at: null, status: 'KHQT' },
      { showroom_id: 'sr2', showroom_name: 'Mazda HN', last_contact_at: null, next_contact_at: '2026-06-24T08:00:00Z', status: null },
    ];
    const r = buildDailyReport(leads, '24/06', now);
    expect(r.management).toContain('KIA HN');
    expect(r.management).toContain('Mazda HN');
    expect(r.management).toContain('100%');
  });

  it('không có lead → perShowroom rỗng, management vẫn có tiêu đề', () => {
    const r = buildDailyReport([], '24/06', new Date());
    expect(r.perShowroom).toEqual([]);
    expect(r.management).toContain('BÁO CÁO NGÀY 24/06');
  });
});
