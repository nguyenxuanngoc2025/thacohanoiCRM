import { describe, it, expect } from 'vitest';
import { buildDailyReport, type ReportLead } from './daily-report';

const L = (over: Partial<ReportLead>): ReportLead => ({
  showroom_id: 'sr1', showroom_name: 'KIA HN',
  last_contact_at: null, next_contact_at: null, status: null, assignee_name: null, ...over,
});

describe('daily-report', () => {
  it('tính per-SR: tổng/đã LH/chưa/quá hạn + phân loại + tỷ lệ LH', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const leads: ReportLead[] = [
      L({ last_contact_at: '2026-06-24T09:00:00Z', status: 'KHQT' }),
      L({ next_contact_at: '2026-06-24T08:00:00Z', status: null }),
      L({ last_contact_at: '2026-06-24T10:00:00Z', status: 'KHĐ' }),
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
    expect(sr.text).toContain('Đã LH: 2 (67%)'); // tỷ lệ LH
  });

  it('nêu tên TVBH chưa tuân thủ (lead quá hạn), xếp nhiều→ít, gom "Chưa phân"', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const od = '2026-06-24T08:00:00Z'; // quá hạn
    const leads: ReportLead[] = [
      L({ next_contact_at: od, assignee_name: 'Nguyễn A' }),
      L({ next_contact_at: od, assignee_name: 'Nguyễn A' }),
      L({ next_contact_at: od, assignee_name: 'Trần B' }),
      L({ next_contact_at: od, assignee_name: null }), // chưa phân
    ];
    const sr = buildDailyReport(leads, '24/06', now).perShowroom[0];
    expect(sr.text).toContain('Chưa tuân thủ: Nguyễn A (2 lead quá hạn)');
    expect(sr.text).toContain('Trần B (1)');
    expect(sr.text).toContain('Chưa phân (1)');
  });

  it('không có ai quá hạn → "Chưa tuân thủ: không có"', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const sr = buildDailyReport([L({ last_contact_at: '2026-06-24T09:00:00Z', assignee_name: 'Nguyễn A' })], '24/06', now).perShowroom[0];
    expect(sr.text).toContain('Chưa tuân thủ: không có');
  });

  it('bảng BLĐ: dòng TỔNG + tỷ lệ LH, sắp theo tỷ lệ LH', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const leads: ReportLead[] = [
      L({ showroom_id: 'sr1', showroom_name: 'KIA HN', last_contact_at: '2026-06-24T09:00:00Z', status: 'KHQT' }),
      L({ showroom_id: 'sr2', showroom_name: 'Mazda HN', next_contact_at: '2026-06-24T08:00:00Z', status: null }),
    ];
    const r = buildDailyReport(leads, '24/06', now);
    expect(r.management).toContain('TỔNG: 2 lead · Đã LH 1 (50%) · Quá hạn 1');
    expect(r.management).toContain('KIA HN');
    expect(r.management).toContain('Mazda HN');
    expect(r.management).toContain('100%');
  });

  it('không có lead → perShowroom rỗng, management vẫn có tiêu đề + TỔNG 0', () => {
    const r = buildDailyReport([], '24/06', new Date());
    expect(r.perShowroom).toEqual([]);
    expect(r.management).toContain('BÁO CÁO NGÀY 24/06');
    expect(r.management).toContain('TỔNG: 0 lead');
  });
});
