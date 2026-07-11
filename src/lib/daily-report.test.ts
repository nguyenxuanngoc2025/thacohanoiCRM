import { describe, it, expect } from 'vitest';
import { buildPeriodReport, buildChannelReport, type ReportLead } from './daily-report';
import { renderChannelDaily } from './notify-templates';

const L = (over: Partial<ReportLead>): ReportLead => ({
  showroom_id: 'sr1', showroom_name: 'KIA HN',
  sales_team_id: null, team_name: null,
  brand_id: null, brand_name: null,
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
    const r = buildPeriodReport(leads, 'NGÀY 24/06', now);
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
    const sr = buildPeriodReport(leads, 'NGÀY 24/06', now).perShowroom[0];
    expect(sr.text).toContain('Chưa tuân thủ: Nguyễn A (2 lead quá hạn)');
    expect(sr.text).toContain('Trần B (1)');
    expect(sr.text).toContain('Chưa phân (1)');
  });

  it('không có ai quá hạn → "Chưa tuân thủ: không có"', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const sr = buildPeriodReport([L({ last_contact_at: '2026-06-24T09:00:00Z', assignee_name: 'Nguyễn A' })], 'NGÀY 24/06', now).perShowroom[0];
    expect(sr.text).toContain('Chưa tuân thủ: không có');
  });

  it('bảng BLĐ: dòng TỔNG + tỷ lệ LH, sắp theo tỷ lệ LH', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const leads: ReportLead[] = [
      L({ showroom_id: 'sr1', showroom_name: 'KIA HN', last_contact_at: '2026-06-24T09:00:00Z', status: 'KHQT' }),
      L({ showroom_id: 'sr2', showroom_name: 'Mazda HN', next_contact_at: '2026-06-24T08:00:00Z', status: null }),
    ];
    const r = buildPeriodReport(leads, 'NGÀY 24/06', now);
    expect(r.management).toContain('TỔNG: 2 lead · Đã LH 1 (50%) · Quá hạn 1');
    expect(r.management).toContain('KIA HN');
    expect(r.management).toContain('Mazda HN');
    expect(r.management).toContain('100%');
  });

  it('không có lead → perTeam/perShowroom rỗng, management vẫn có tiêu đề + TỔNG 0', () => {
    const r = buildPeriodReport([], 'NGÀY 24/06', new Date());
    expect(r.perTeam).toEqual([]);
    expect(r.perShowroom).toEqual([]);
    expect(r.management).toContain('BÁO CÁO NGÀY 24/06');
    expect(r.management).toContain('TỔNG: 0 lead');
  });

  it('seed: phòng/showroom đã cấu hình group nhưng 0 lead vẫn ra báo cáo số 0', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const r = buildPeriodReport([], 'NGÀY 24/06', now, {
      teams: [{ id: 't9', name: 'Phòng Đài Tư' }],
      showrooms: [{ id: 'sr9', name: 'Showroom Đài Tư' }],
    });
    expect(r.perTeam).toHaveLength(1);
    expect(r.perTeam[0].id).toBe('t9');
    expect(r.perTeam[0].stats.total).toBe(0);
    expect(r.perTeam[0].text).toContain('BÁO CÁO NGÀY 24/06 — Phòng Đài Tư');
    expect(r.perShowroom).toHaveLength(1);
    expect(r.perShowroom[0].id).toBe('sr9');
    expect(r.perShowroom[0].stats.total).toBe(0);
  });

  it('seed + có lead cùng phòng: gộp đúng 1 bucket, không tạo trùng', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const leads: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng KIA 1', last_contact_at: '2026-06-24T09:00:00Z', status: 'KHQT' }),
    ];
    const r = buildPeriodReport(leads, 'NGÀY 24/06', now, { teams: [{ id: 't1', name: 'Phòng KIA 1' }] });
    expect(r.perTeam).toHaveLength(1);
    expect(r.perTeam[0].id).toBe('t1');
    expect(r.perTeam[0].stats.total).toBe(1);
  });

  it('perTeam: chỉ gom lead có sales_team_id; báo cáo tiêu đề theo tên phòng', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const leads: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng KIA 1', last_contact_at: '2026-06-24T09:00:00Z', status: 'KHQT' }),
      L({ sales_team_id: 't1', team_name: 'Phòng KIA 1', next_contact_at: '2026-06-24T08:00:00Z' }),
      L({ sales_team_id: null, team_name: null, last_contact_at: '2026-06-24T09:00:00Z' }), // không vào perTeam
    ];
    const r = buildPeriodReport(leads, 'NGÀY 24/06', now);
    expect(r.perTeam).toHaveLength(1);
    const t = r.perTeam[0];
    expect(t.id).toBe('t1');
    expect(t.stats.total).toBe(2); // chỉ 2 lead có team
    expect(t.text).toContain('BÁO CÁO NGÀY 24/06 — Phòng KIA 1');
    // showroom vẫn tính đủ 3 lead
    expect(r.perShowroom[0].stats.total).toBe(3);
  });

  it('buildChannelReport: TỔNG QUAN = cộng dồn các phòng + tách thương hiệu', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const leads: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng 1', brand_id: 'kia', brand_name: 'KIA', last_contact_at: '2026-06-24T09:00:00Z', status: 'KHQT' }),
      L({ sales_team_id: 't1', team_name: 'Phòng 1', brand_id: 'maz', brand_name: 'Mazda', next_contact_at: '2026-06-24T08:00:00Z' }),
      L({ sales_team_id: 't2', team_name: 'Phòng 2', brand_id: 'kia', brand_name: 'KIA', last_contact_at: '2026-06-24T09:00:00Z', status: 'KHĐ' }),
    ];
    const r = buildChannelReport(leads, 'NGÀY 24/06', now, {
      headerName: 'Showroom PVD',
      teams: [{ id: 't1', name: 'Phòng 1' }, { id: 't2', name: 'Phòng 2' }],
    });
    expect(r.headerName).toBe('Showroom PVD');
    expect(r.overview.stats.total).toBe(3);
    expect(r.overview.stats.contacted).toBe(2);
    const ov = r.overview.brands.map((b) => b.name).sort();
    expect(ov).toEqual(['KIA', 'Mazda']);
    const kia = r.overview.brands.find((b) => b.name === 'KIA')!;
    expect(kia.stats.total).toBe(2);
    expect(r.phongs).toHaveLength(2);
    const p1 = r.phongs.find((p) => p.name === 'Phòng 1')!;
    expect(p1.stats.total).toBe(2);
    expect(p1.brands.map((b) => b.name).sort()).toEqual(['KIA', 'Mazda']);
    const p2 = r.phongs.find((p) => p.name === 'Phòng 2')!;
    expect(p2.stats.total).toBe(1);
  });

  it('buildChannelReport → renderChannelDaily: ra text có TỔNG QUAN + phòng', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const leads: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng 1', brand_id: 'kia', brand_name: 'KIA', last_contact_at: '2026-06-24T09:00:00Z' }),
      L({ sales_team_id: 't2', team_name: 'Phòng 2', brand_id: 'maz', brand_name: 'Mazda' }),
    ];
    const r = buildChannelReport(leads, 'NGÀY 24/06', now, {
      headerName: 'SR PVD', teams: [{ id: 't1', name: 'Phòng 1' }, { id: 't2', name: 'Phòng 2' }],
    });
    const text = renderChannelDaily(r);
    expect(text).toContain('BÁO CÁO NGÀY 24/06 — SR PVD');
    expect(text).toContain('<b>TỔNG QUAN</b>');
    expect(text).toContain('<b>PHÒNG Phòng 1</b>');
  });

  it('buildChannelReport: phòng seed 0 lead vẫn xuất hiện; chỉ gom lead trong tập phòng', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const leads: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng 1', brand_id: 'kia', brand_name: 'KIA', last_contact_at: '2026-06-24T09:00:00Z' }),
      L({ sales_team_id: 'tX', team_name: 'Ngoài kênh', brand_id: 'kia', brand_name: 'KIA' }),
    ];
    const r = buildChannelReport(leads, 'NGÀY 24/06', now, {
      headerName: 'SR',
      teams: [{ id: 't1', name: 'Phòng 1' }, { id: 't2', name: 'Phòng 2' }],
    });
    expect(r.overview.stats.total).toBe(1);
    expect(r.phongs).toHaveLength(2);
    expect(r.phongs.find((p) => p.name === 'Phòng 2')!.stats.total).toBe(0);
  });
});
