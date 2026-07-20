import { describe, it, expect } from 'vitest';
import { buildPeriodReport, buildChannelReport, buildLongPeriodReport, buildChannelPeriodReport, buildBrandReport, type ReportLead } from './daily-report';
import { renderChannelDaily, renderChannelPeriod } from './notify-templates';

const L = (over: Partial<ReportLead>): ReportLead => ({
  showroom_id: 'sr1', showroom_name: 'KIA HN',
  sales_team_id: null, team_name: null,
  brand_id: null, brand_name: null,
  model_id: null, model_name: null,
  company_id: null,
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

  it('buildChannelReport: brand_ids seed → hãng 0 lead vẫn hiện chi tiết (stats 0)', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const leads: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng 1', brand_id: 'kia', brand_name: 'KIA', last_contact_at: '2026-06-24T09:00:00Z' }),
    ];
    const r = buildChannelReport(leads, 'NGÀY 24/06', now, {
      headerName: 'SR PVD',
      teams: [{ id: 't1', name: 'Phòng 1', brand_ids: ['kia', 'maz'] }],
      brands: [{ id: 'kia', name: 'KIA' }, { id: 'maz', name: 'Mazda' }],
    });
    const p1 = r.phongs.find((p) => p.name === 'Phòng 1')!;
    // Cả 2 hãng phải xuất hiện dù Mazda 0 lead.
    expect(p1.brands.map((b) => b.name).sort()).toEqual(['KIA', 'Mazda']);
    expect(p1.brands.find((b) => b.name === 'Mazda')!.stats.total).toBe(0);
    expect(p1.brands.find((b) => b.name === 'KIA')!.stats.total).toBe(1);
    // TỔNG QUAN cũng gồm cả 2 hãng.
    expect(r.overview.brands.map((b) => b.name).sort()).toEqual(['KIA', 'Mazda']);
  });
});

describe('buildLongPeriodReport (tuần/tháng — tập trung kết quả)', () => {
  const now = new Date('2026-07-20T01:00:00Z');

  it('perShowroom: phễu chốt + tỷ lệ chốt + so sánh kỳ trước, KHÔNG "quá hạn/chưa tuân thủ"', () => {
    const current: ReportLead[] = [
      L({ showroom_id: 'sr1', showroom_name: 'KIA HN', last_contact_at: '2026-07-14T09:00:00Z', status: 'KHQT' }),
      L({ showroom_id: 'sr1', showroom_name: 'KIA HN', last_contact_at: '2026-07-15T09:00:00Z', status: 'KHĐ' }),
      L({ showroom_id: 'sr1', showroom_name: 'KIA HN', status: null }),
      L({ showroom_id: 'sr1', showroom_name: 'KIA HN', status: 'GDTD', last_contact_at: '2026-07-16T09:00:00Z' }),
    ];
    const previous: ReportLead[] = [
      L({ showroom_id: 'sr1', showroom_name: 'KIA HN', status: 'KHĐ', last_contact_at: '2026-07-07T09:00:00Z' }),
      L({ showroom_id: 'sr1', showroom_name: 'KIA HN', status: null }),
    ];
    const r = buildLongPeriodReport(current, previous, 'TUẦN 13/07–19/07', 'TUẦN 06/07–12/07', now);
    expect(r.perShowroom).toHaveLength(1);
    const sr = r.perShowroom[0];
    expect(sr.stats.total).toBe(4);
    expect(sr.stats.KyHD).toBe(1);
    expect(sr.text).toContain('BÁO CÁO TUẦN 13/07–19/07 — KIA HN');
    expect(sr.text).toContain('Phễu chốt: KHQT 1 → Đàm phán 1 → Ký HĐ');
    expect(sr.text).toContain('Tỷ lệ chốt:');
    // so sánh kỳ trước: tổng 4 vs 2 → ↑2
    expect(sr.text).toContain('↑2 so kỳ trước');
    expect(sr.text).toContain('Kỳ trước (TUẦN 06/07–12/07)');
    // KHÔNG có nội dung báo cáo ngày
    expect(sr.text).not.toContain('Quá hạn');
    expect(sr.text).not.toContain('Chưa tuân thủ');
  });

  it('management: xếp hạng showroom theo Ký HĐ + so kỳ trước', () => {
    const current: ReportLead[] = [
      L({ showroom_id: 'sr1', showroom_name: 'KIA HN', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
      L({ showroom_id: 'sr2', showroom_name: 'Mazda HN', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
      L({ showroom_id: 'sr2', showroom_name: 'Mazda HN', status: 'KHĐ', last_contact_at: '2026-07-15T09:00:00Z' }),
    ];
    const r = buildLongPeriodReport(current, [], 'THÁNG 06/2026', 'THÁNG 05/2026', now);
    expect(r.management).toContain('BÁO CÁO THÁNG 06/2026 — TỔNG HỢP BLĐ');
    expect(r.management).toContain('Xếp hạng showroom (theo Ký HĐ):');
    // Mazda 2 hợp đồng → hạng 1, KIA hạng 2
    const idxMazda = r.management.indexOf('Mazda HN');
    const idxKia = r.management.indexOf('KIA HN');
    expect(idxMazda).toBeLessThan(idxKia);
    expect(r.management).toContain('1. Mazda HN');
    expect(r.management).toContain('Kỳ trước (THÁNG 05/2026)');
  });

  it('seed showroom 0 lead vẫn ra báo cáo', () => {
    const r = buildLongPeriodReport([], [], 'TUẦN 13/07–19/07', 'TUẦN 06/07–12/07', now, {
      showrooms: [{ id: 'sr9', name: 'Showroom Mới' }],
    });
    expect(r.perShowroom).toHaveLength(1);
    expect(r.perShowroom[0].stats.total).toBe(0);
    expect(r.perShowroom[0].text).toContain('Showroom Mới');
  });
});

describe('buildChannelPeriodReport (kênh nhóm bán hàng — tuần/tháng kết quả)', () => {
  const now = new Date('2026-07-20T01:00:00Z');

  it('TỔNG QUAN = cộng dồn phòng + tách hãng, mỗi phòng kèm cur/prev', () => {
    const current: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng 1', brand_id: 'kia', brand_name: 'KIA', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
      L({ sales_team_id: 't1', team_name: 'Phòng 1', brand_id: 'maz', brand_name: 'Mazda', status: 'KHQT', last_contact_at: '2026-07-15T09:00:00Z' }),
      L({ sales_team_id: 't2', team_name: 'Phòng 2', brand_id: 'kia', brand_name: 'KIA', status: 'GDTD', last_contact_at: '2026-07-16T09:00:00Z' }),
    ];
    const previous: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng 1', brand_id: 'kia', brand_name: 'KIA', status: null }),
    ];
    const r = buildChannelPeriodReport(current, previous, 'TUẦN 13/07–19/07', 'TUẦN 06/07–12/07', now, {
      headerName: 'Showroom PVD',
      teams: [{ id: 't1', name: 'Phòng 1' }, { id: 't2', name: 'Phòng 2' }],
    });
    expect(r.headerName).toBe('Showroom PVD');
    expect(r.overview.cur.total).toBe(3);
    expect(r.overview.prev.total).toBe(1);
    expect(r.overview.cur.KyHD).toBe(1);
    expect(r.overview.brands.map((b) => b.name).sort()).toEqual(['KIA', 'Mazda']);
    expect(r.phongs).toHaveLength(2);
    const p1 = r.phongs.find((p) => p.name === 'Phòng 1')!;
    expect(p1.cur.total).toBe(2);
    expect(p1.prev.total).toBe(1);
    const p2 = r.phongs.find((p) => p.name === 'Phòng 2')!;
    expect(p2.cur.total).toBe(1);
    expect(p2.prev.total).toBe(0);
  });

  it('chỉ gom lead trong tập phòng của kênh; phòng seed 0 lead vẫn hiện', () => {
    const current: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng 1', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
      L({ sales_team_id: 'tX', team_name: 'Ngoài kênh', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
    ];
    const r = buildChannelPeriodReport(current, [], 'TUẦN 13/07–19/07', 'TUẦN 06/07–12/07', now, {
      headerName: 'SR', teams: [{ id: 't1', name: 'Phòng 1' }, { id: 't2', name: 'Phòng 2' }],
    });
    expect(r.overview.cur.total).toBe(1);
    expect(r.phongs).toHaveLength(2);
    expect(r.phongs.find((p) => p.name === 'Phòng 2')!.cur.total).toBe(0);
  });

  it('renderChannelPeriod: nhiều phòng → TỔNG QUAN + từng phòng, có phễu + so kỳ trước, KHÔNG quá hạn', () => {
    const current: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng 1', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
      L({ sales_team_id: 't2', team_name: 'Phòng 2', status: 'KHQT', last_contact_at: '2026-07-15T09:00:00Z' }),
    ];
    const r = buildChannelPeriodReport(current, [], 'TUẦN 13/07–19/07', 'TUẦN 06/07–12/07', now, {
      headerName: 'SR PVD', teams: [{ id: 't1', name: 'Phòng 1' }, { id: 't2', name: 'Phòng 2' }],
    });
    const text = renderChannelPeriod(r);
    expect(text).toContain('BÁO CÁO TUẦN 13/07–19/07 — SR PVD');
    expect(text).toContain('<b>TỔNG QUAN</b>');
    expect(text).toContain('<b>PHÒNG Phòng 1</b>');
    expect(text).toContain('Phễu chốt: KHQT');
    expect(text).toContain('Tỷ lệ chốt:');
    expect(text).toContain('Kỳ trước (TUẦN 06/07–12/07)');
    expect(text).not.toContain('Quá hạn');
    expect(text).not.toContain('Chưa tuân thủ');
  });

  it('renderChannelPeriod: kênh 1 phòng → bỏ TỔNG QUAN, hiện thẳng 1 khối', () => {
    const current: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng Tải Bus', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
    ];
    const r = buildChannelPeriodReport(current, [], 'TUẦN 13/07–19/07', 'TUẦN 06/07–12/07', now, {
      headerName: 'Nhóm Tải Bus', teams: [{ id: 't1', name: 'Phòng Tải Bus' }],
    });
    const text = renderChannelPeriod(r);
    expect(text).toContain('BÁO CÁO TUẦN 13/07–19/07 — Phòng Tải Bus');
    expect(text).not.toContain('TỔNG QUAN');
    expect(text).toContain('Kỳ trước (TUẦN 06/07–12/07)');
  });
});

describe('buildChannelReport — tách theo dòng xe (report_by_model)', () => {
  const now = new Date('2026-07-20T01:00:00Z');
  const TB = 'tai-bus';

  it('thương hiệu có cờ → gom theo DÒNG XE (byModel), có "Chưa xác định", sắp theo tổng giảm dần', () => {
    const leads: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng Tải Bus', brand_id: TB, brand_name: 'Tải Bus', model_id: 'm-van', model_name: 'Tải Van', last_contact_at: '2026-07-14T09:00:00Z', status: 'KHQT' }),
      L({ sales_team_id: 't1', team_name: 'Phòng Tải Bus', brand_id: TB, brand_name: 'Tải Bus', model_id: 'm-van', model_name: 'Tải Van', status: null }),
      L({ sales_team_id: 't1', team_name: 'Phòng Tải Bus', brand_id: TB, brand_name: 'Tải Bus', model_id: 'm-van', model_name: 'Tải Van', last_contact_at: '2026-07-15T09:00:00Z', status: 'KHĐ' }),
      L({ sales_team_id: 't1', team_name: 'Phòng Tải Bus', brand_id: TB, brand_name: 'Tải Bus', model_id: 'm-dau', model_name: 'Tải nhẹ máy dầu', last_contact_at: '2026-07-15T09:00:00Z' }),
      L({ sales_team_id: 't1', team_name: 'Phòng Tải Bus', brand_id: TB, brand_name: 'Tải Bus', model_id: 'm-dau', model_name: 'Tải nhẹ máy dầu', status: null }),
      L({ sales_team_id: 't1', team_name: 'Phòng Tải Bus', brand_id: TB, brand_name: 'Tải Bus', model_id: null, model_name: null, status: null }),
    ];
    const r = buildChannelReport(leads, 'NGÀY 20/07', now, {
      headerName: 'Nhóm Tải Bus',
      teams: [{ id: 't1', name: 'Phòng Tải Bus', brand_ids: [TB] }],
      brands: [{ id: TB, name: 'Tải Bus' }],
    }, new Set([TB]));
    const p1 = r.phongs.find((p) => p.name === 'Phòng Tải Bus')!;
    expect(p1.byModel).toBe(true);
    expect(p1.brands.map((b) => b.name)).toEqual(['Tải Van', 'Tải nhẹ máy dầu', 'Chưa xác định']);
    expect(p1.brands.find((b) => b.name === 'Tải Van')!.stats.total).toBe(3);
    expect(p1.brands.find((b) => b.name === 'Chưa xác định')!.stats.total).toBe(1);
    expect(r.overview.byModel).toBe(true);
  });

  it('thương hiệu thường (không cờ) → giữ gom theo THƯƠNG HIỆU (byModel=false)', () => {
    const leads: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng 1', brand_id: 'kia', brand_name: 'KIA', model_id: 'm1', model_name: 'Seltos', last_contact_at: '2026-07-14T09:00:00Z' }),
    ];
    const r = buildChannelReport(leads, 'NGÀY 20/07', now, {
      headerName: 'SR', teams: [{ id: 't1', name: 'Phòng 1', brand_ids: ['kia'] }], brands: [{ id: 'kia', name: 'KIA' }],
    }, new Set([TB]));
    const p1 = r.phongs[0];
    expect(p1.byModel).toBe(false);
    expect(p1.brands.map((b) => b.name)).toEqual(['KIA']);
  });
});

describe('buildChannelPeriodReport — tách theo dòng xe (report_by_model)', () => {
  const now = new Date('2026-07-20T01:00:00Z');
  const TB = 'tai-bus';

  it('thương hiệu có cờ → phòng byModel + gom theo dòng xe', () => {
    const current: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng Tải Bus', brand_id: TB, brand_name: 'Tải Bus', model_id: 'm-van', model_name: 'Tải Van', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
    ];
    const r = buildChannelPeriodReport(current, [], 'TUẦN 13/07–19/07', 'TUẦN 06/07–12/07', now, {
      headerName: 'Nhóm Tải Bus', teams: [{ id: 't1', name: 'Phòng Tải Bus', brand_ids: [TB] }], brands: [{ id: TB, name: 'Tải Bus' }],
    }, new Set([TB]));
    const p1 = r.phongs[0];
    expect(p1.byModel).toBe(true);
    expect(p1.brands.map((b) => b.name)).toEqual(['Tải Van']);
    expect(r.overview.byModel).toBe(true);
  });
});

describe('renderer — tiêu đề chi tiết theo dòng xe vs thương hiệu', () => {
  const now = new Date('2026-07-20T01:00:00Z');
  const TB = 'tai-bus';

  it('renderChannelDaily: kênh byModel → "Chi tiết theo dòng xe:", KHÔNG "theo thương hiệu:"', () => {
    const leads: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng Tải Bus', brand_id: TB, brand_name: 'Tải Bus', model_id: 'm-van', model_name: 'Tải Van', last_contact_at: '2026-07-14T09:00:00Z' }),
    ];
    const r = buildChannelReport(leads, 'NGÀY 20/07', now, {
      headerName: 'Nhóm Tải Bus', teams: [{ id: 't1', name: 'Phòng Tải Bus', brand_ids: [TB] }], brands: [{ id: TB, name: 'Tải Bus' }],
    }, new Set([TB]));
    const text = renderChannelDaily(r);
    expect(text).toContain('Chi tiết theo dòng xe:');
    expect(text).not.toContain('Chi tiết theo thương hiệu:');
    expect(text).toContain('· Tải Van —');
  });

  it('renderChannelDaily: kênh thường → giữ "Chi tiết theo thương hiệu:"', () => {
    const leads: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng 1', brand_id: 'kia', brand_name: 'KIA', last_contact_at: '2026-07-14T09:00:00Z' }),
    ];
    const r = buildChannelReport(leads, 'NGÀY 20/07', now, {
      headerName: 'SR', teams: [{ id: 't1', name: 'Phòng 1', brand_ids: ['kia'] }], brands: [{ id: 'kia', name: 'KIA' }],
    });
    const text = renderChannelDaily(r);
    expect(text).toContain('Chi tiết theo thương hiệu:');
    expect(text).not.toContain('Chi tiết theo dòng xe:');
  });

  it('renderChannelPeriod: kênh byModel → "Chi tiết theo dòng xe:"', () => {
    const current: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng Tải Bus', brand_id: TB, brand_name: 'Tải Bus', model_id: 'm-van', model_name: 'Tải Van', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
    ];
    const r = buildChannelPeriodReport(current, [], 'TUẦN 13/07–19/07', 'TUẦN 06/07–12/07', now, {
      headerName: 'Nhóm Tải Bus', teams: [{ id: 't1', name: 'Phòng Tải Bus', brand_ids: [TB] }], brands: [{ id: TB, name: 'Tải Bus' }],
    }, new Set([TB]));
    const text = renderChannelPeriod(r);
    expect(text).toContain('Chi tiết theo dòng xe:');
    expect(text).not.toContain('Chi tiết theo thương hiệu:');
  });

  it('buildLongPeriodReport: showroom byModel → perShowroom render "Chi tiết theo dòng xe:"', () => {
    const current: ReportLead[] = [
      L({ showroom_id: 'sr1', showroom_name: 'SR Tải Bus', brand_id: TB, brand_name: 'Tải Bus', model_id: 'm-van', model_name: 'Tải Van', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
    ];
    const r = buildLongPeriodReport(current, [], 'TUẦN 13/07–19/07', 'TUẦN 06/07–12/07', now, undefined, new Set([TB]));
    expect(r.perShowroom[0].text).toContain('Chi tiết theo dòng xe:');
  });

  it('buildLongPeriodReport: showroom LẪN hãng cờ + hãng thường → fallback THƯƠNG HIỆU, KHÔNG trộn dòng xe', () => {
    const KIA = 'b-kia';
    const current: ReportLead[] = [
      L({ showroom_id: 'sr1', showroom_name: 'SR lẫn hãng', brand_id: TB, brand_name: 'Tải Bus', model_id: 'm-van', model_name: 'Tải Van', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
      L({ showroom_id: 'sr1', showroom_name: 'SR lẫn hãng', brand_id: KIA, brand_name: 'KIA', status: 'KHQT', last_contact_at: '2026-07-14T10:00:00Z' }),
    ];
    const r = buildLongPeriodReport(current, [], 'TUẦN 13/07–19/07', 'TUẦN 06/07–12/07', now, undefined, new Set([TB]));
    const text = r.perShowroom[0].text;
    // Lẫn hãng → không được gom theo dòng xe (tránh trộn "Tải Van" với "KIA" dưới 1 tiêu đề).
    expect(text).toContain('Chi tiết theo thương hiệu:');
    expect(text).not.toContain('Chi tiết theo dòng xe:');
    // Chi tiết hiện theo TÊN HÃNG, không hiện tên dòng xe.
    expect(text).toContain('Tải Bus');
    expect(text).toContain('KIA');
    expect(text).not.toContain('Tải Van');
  });
});

describe('buildBrandReport', () => {
  const now = new Date('2026-07-20T10:00:00Z');
  const seedKM = { headerName: 'BLĐ KIA-Mazda', brands: [{ id: 'kia', name: 'KIA' }, { id: 'mz', name: 'Mazda' }] };

  it('1 hãng: tổng đúng + gom theo dòng xe/showroom, sắp theo tổng giảm dần', () => {
    const leads = [
      L({ brand_id: 'kia', model_id: 'm1', model_name: 'Seltos', showroom_id: 's1', showroom_name: 'SR A', last_contact_at: '2026-07-20T09:00:00Z', status: 'KHQT' }),
      L({ brand_id: 'kia', model_id: 'm2', model_name: 'Sonet', showroom_id: 's1', showroom_name: 'SR A' }),
      L({ brand_id: 'kia', model_id: 'm2', model_name: 'Sonet', showroom_id: 's2', showroom_name: 'SR B' }),
    ];
    const r = buildBrandReport(leads, 'NGÀY 20/07', now, { headerName: 'H', brands: [{ id: 'kia', name: 'KIA' }] });
    expect(r.blocks).toHaveLength(1);
    const b = r.blocks[0];
    expect(b.brandName).toBe('KIA');
    expect(b.stats.total).toBe(3);
    expect(b.stats.contacted).toBe(1);
    expect(b.stats.KHQT).toBe(1);
    expect(b.models.map((m) => m.name)).toEqual(['Sonet', 'Seltos']);
    expect(b.showrooms.map((s) => s.name)).toEqual(['SR A', 'SR B']);
  });

  it('nhiều hãng: mỗi khối chỉ lead hãng đó', () => {
    const leads = [
      L({ brand_id: 'kia', model_id: 'm1', model_name: 'Seltos', showroom_id: 's1' }),
      L({ brand_id: 'mz', model_id: 'm3', model_name: 'CX-5', showroom_id: 's1' }),
      L({ brand_id: 'mz', model_id: 'm3', model_name: 'CX-5', showroom_id: 's1' }),
    ];
    const r = buildBrandReport(leads, 'NGÀY 20/07', now, seedKM);
    expect(r.blocks.map((b) => b.brandName)).toEqual(['KIA', 'Mazda']);
    expect(r.blocks[0].stats.total).toBe(1);
    expect(r.blocks[1].stats.total).toBe(2);
  });

  it('lead thiếu dòng xe → nhóm "Chưa xác định"', () => {
    const leads = [L({ brand_id: 'kia', model_id: null, model_name: null, showroom_id: 's1' })];
    const r = buildBrandReport(leads, 'NGÀY 20/07', now, { headerName: 'H', brands: [{ id: 'kia', name: 'KIA' }] });
    expect(r.blocks[0].models[0].name).toBe('Chưa xác định');
  });

  it('seed hãng 0 lead → vẫn có khối stats 0, model/showroom rỗng', () => {
    const r = buildBrandReport([], 'NGÀY 20/07', now, seedKM);
    expect(r.blocks).toHaveLength(2);
    expect(r.blocks[0].stats.total).toBe(0);
    expect(r.blocks[0].models).toEqual([]);
    expect(r.blocks[0].showrooms).toEqual([]);
  });

  it('lead ngoài tập seed bị bỏ qua (cô lập)', () => {
    const leads = [L({ brand_id: 'other', model_id: 'x', showroom_id: 's1' })];
    const r = buildBrandReport(leads, 'NGÀY 20/07', now, { headerName: 'H', brands: [{ id: 'kia', name: 'KIA' }] });
    expect(r.blocks[0].stats.total).toBe(0);
  });
});
