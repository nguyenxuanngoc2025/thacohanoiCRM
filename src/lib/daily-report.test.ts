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
    expect(sr.text).toContain('Em xin kính gửi Báo cáo Ngày 24/06');
    expect(sr.text).toContain('<b>Kính gửi Quý Anh/Chị KIA HN</b>');
    expect(sr.text).toContain('Tổng Lead: <b>3</b>');
    expect(sr.text).toContain('đã liên hệ <b>2</b>');
  });

  it('nêu tên TVBH chưa tuân thủ (Lead quá hạn), xếp nhiều→ít, gom "Chưa phân"', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const od = '2026-06-24T08:00:00Z'; // quá hạn
    const leads: ReportLead[] = [
      L({ next_contact_at: od, assignee_name: 'Nguyễn A' }),
      L({ next_contact_at: od, assignee_name: 'Nguyễn A' }),
      L({ next_contact_at: od, assignee_name: 'Trần B' }),
      L({ next_contact_at: od, assignee_name: null }), // chưa phân
    ];
    const sr = buildPeriodReport(leads, 'NGÀY 24/06', now).perShowroom[0];
    expect(sr.text).toContain('<b>Chưa tuân thủ</b>');
    expect(sr.text).toContain('• <b>Nguyễn A</b> — 2 Lead quá hạn chưa liên hệ');
    expect(sr.text).toContain('• <b>Trần B</b> — 1 Lead quá hạn chưa liên hệ');
    expect(sr.text).toContain('• <b>Chưa phân</b> — 1 Lead quá hạn chưa liên hệ');
  });

  it('không có ai quá hạn → ẨN hẳn mục "Chưa tuân thủ"', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const sr = buildPeriodReport([L({ last_contact_at: '2026-06-24T09:00:00Z', assignee_name: 'Nguyễn A' })], 'NGÀY 24/06', now).perShowroom[0];
    expect(sr.text).not.toContain('Chưa tuân thủ');
    expect(sr.text).not.toContain('Không có Lead quá hạn');
  });

  it('bảng BLĐ: dòng tổng + chi tiết Theo thương hiệu', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const leads: ReportLead[] = [
      L({ showroom_id: 'sr1', showroom_name: 'KIA HN', brand_id: 'kia', brand_name: 'KIA', last_contact_at: '2026-06-24T09:00:00Z', status: 'KHQT' }),
      L({ showroom_id: 'sr2', showroom_name: 'Mazda HN', brand_id: 'maz', brand_name: 'Mazda', next_contact_at: '2026-06-24T08:00:00Z', status: null }),
    ];
    const r = buildPeriodReport(leads, 'NGÀY 24/06', now);
    expect(r.management).toContain('Kính gửi Quý Ban lãnh đạo cùng các Anh/Chị');
    expect(r.management).toContain('Tổng Lead: <b>2</b>');
    expect(r.management).toContain('<b>Theo thương hiệu</b>');
    expect(r.management).toContain('• <b>KIA</b>: <b>1</b> Lead');
    expect(r.management).toContain('• <b>Mazda</b>: <b>1</b> Lead');
  });

  it('không có lead → perShowroom rỗng, management vẫn có tiêu đề + tổng 0', () => {
    const r = buildPeriodReport([], 'NGÀY 24/06', new Date());
    expect(r.perShowroom).toEqual([]);
    expect(r.management).toContain('Em xin kính gửi Báo cáo Ngày 24/06');
    expect(r.management).toContain('Tổng Lead: <b>0</b>');
  });

  it('seed: showroom đã cấu hình group nhưng 0 lead vẫn ra báo cáo số 0', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const r = buildPeriodReport([], 'NGÀY 24/06', now, {
      showrooms: [{ id: 'sr9', name: 'Showroom Đài Tư' }],
    });
    expect(r.perShowroom).toHaveLength(1);
    expect(r.perShowroom[0].id).toBe('sr9');
    expect(r.perShowroom[0].stats.total).toBe(0);
    expect(r.perShowroom[0].text).toContain('<b>Kính gửi Quý Anh/Chị Showroom Đài Tư</b>');
  });

  it('seed + có lead cùng showroom: gộp đúng 1 bucket, không tạo trùng', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const leads: ReportLead[] = [
      L({ showroom_id: 'sr9', showroom_name: 'Showroom Đài Tư', last_contact_at: '2026-06-24T09:00:00Z', status: 'KHQT' }),
    ];
    const r = buildPeriodReport(leads, 'NGÀY 24/06', now, { showrooms: [{ id: 'sr9', name: 'Showroom Đài Tư' }] });
    expect(r.perShowroom).toHaveLength(1);
    expect(r.perShowroom[0].id).toBe('sr9');
    expect(r.perShowroom[0].stats.total).toBe(1);
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
    expect(text).toContain('Em xin kính gửi Báo cáo Ngày 24/06');
    expect(text).toContain('<b>Kính gửi Quý Anh/Chị SR PVD</b>');
    expect(text).toContain('<b>Theo phòng bán hàng</b>');
    expect(text).toContain('• <b>Phòng 1</b>');
  });

  it('buildChannelReport: gom lead tồn đọng theo TVBH (chỉ phòng trong kênh), sắp giảm dần', () => {
    const now = new Date('2026-06-24T18:00:00Z');
    const r = buildChannelReport([], 'NGÀY 24/06', now,
      { headerName: 'SR', teams: [{ id: 't1', name: 'Phòng 1' }, { id: 't2', name: 'Phòng 2' }] },
      new Set(),
      [
        { sales_team_id: 't1', assignee_name: 'Nguyễn A' },
        { sales_team_id: 't1', assignee_name: 'Nguyễn A' },
        { sales_team_id: 't2', assignee_name: 'Trần B' },
        { sales_team_id: 'tX', assignee_name: 'Ngoài kênh' }, // phòng ngoài kênh → bỏ
      ],
    );
    expect(r.uncontacted).toEqual([
      { name: 'Nguyễn A', count: 2 },
      { name: 'Trần B', count: 1 },
    ]);
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
    expect(sr.text).toContain('Em xin kính gửi Báo cáo Tuần 13/07–19/07');
    expect(sr.text).toContain('<b>Kính gửi Quý Anh/Chị KIA HN</b>');
    expect(sr.text).toContain('Tổng Lead: <b>4</b>');
    expect(sr.text).toContain('KHĐ <b>1</b>');
    // so sánh kỳ trước: tổng 4 vs 2 → ↑2
    expect(sr.text).toContain('↑2 so kỳ trước');
    expect(sr.text).toContain('Kỳ trước (TUẦN 06/07–12/07)');
    // KHÔNG có nội dung báo cáo ngày
    expect(sr.text).not.toContain('Quá hạn');
    expect(sr.text).not.toContain('Chưa tuân thủ');
  });

  it('management: dòng tổng + chi tiết Theo thương hiệu + so kỳ trước, KHÔNG xếp hạng showroom', () => {
    const current: ReportLead[] = [
      L({ showroom_id: 'sr1', showroom_name: 'KIA HN', brand_id: 'kia', brand_name: 'KIA', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
      L({ showroom_id: 'sr2', showroom_name: 'Mazda HN', brand_id: 'maz', brand_name: 'Mazda', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
      L({ showroom_id: 'sr2', showroom_name: 'Mazda HN', brand_id: 'maz', brand_name: 'Mazda', status: 'KHĐ', last_contact_at: '2026-07-15T09:00:00Z' }),
    ];
    const r = buildLongPeriodReport(current, [], 'THÁNG 06/2026', 'THÁNG 05/2026', now);
    expect(r.management).toContain('Em xin kính gửi Báo cáo Tháng 06/2026');
    expect(r.management).toContain('Kính gửi Quý Ban lãnh đạo cùng các Anh/Chị');
    expect(r.management).not.toContain('Xếp hạng showroom');
    expect(r.management).toContain('<b>Theo thương hiệu</b>');
    expect(r.management).toContain('• <b>Mazda</b>: <b>2</b> Lead');
    expect(r.management).toContain('• <b>KIA</b>: <b>1</b> Lead');
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
    expect(text).toContain('Em xin kính gửi Báo cáo Tuần 13/07–19/07');
    expect(text).toContain('<b>Kính gửi Quý Anh/Chị SR PVD</b>');
    expect(text).toContain('<b>Theo phòng bán hàng</b>');
    expect(text).toContain('• <b>Phòng 1</b>');
    expect(text).toContain('Kỳ trước (TUẦN 06/07–12/07)');
    expect(text).not.toContain('Quá hạn');
    expect(text).not.toContain('Chưa tuân thủ');
  });

  it('renderChannelPeriod: kênh 1 phòng → hiện thẳng 1 khối theo tên phòng, không có mục Theo phòng', () => {
    const current: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng Tải Bus', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
    ];
    const r = buildChannelPeriodReport(current, [], 'TUẦN 13/07–19/07', 'TUẦN 06/07–12/07', now, {
      headerName: 'Nhóm Tải Bus', teams: [{ id: 't1', name: 'Phòng Tải Bus' }],
    });
    const text = renderChannelPeriod(r);
    expect(text).toContain('<b>Kính gửi Quý Anh/Chị Phòng Tải Bus</b>');
    expect(text).not.toContain('Theo phòng bán hàng');
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

  it('renderChannelDaily: kênh byModel → "Theo dòng xe", KHÔNG "Theo thương hiệu"', () => {
    const leads: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng Tải Bus', brand_id: TB, brand_name: 'Tải Bus', model_id: 'm-van', model_name: 'Tải Van', last_contact_at: '2026-07-14T09:00:00Z' }),
    ];
    const r = buildChannelReport(leads, 'NGÀY 20/07', now, {
      headerName: 'Nhóm Tải Bus', teams: [{ id: 't1', name: 'Phòng Tải Bus', brand_ids: [TB] }], brands: [{ id: TB, name: 'Tải Bus' }],
    }, new Set([TB]));
    const text = renderChannelDaily(r);
    expect(text).toContain('<b>Theo dòng xe</b>');
    expect(text).not.toContain('<b>Theo thương hiệu</b>');
    expect(text).toContain('• <b>Tải Van</b>');
  });

  it('renderChannelDaily: kênh thường nhiều hãng → giữ "Theo thương hiệu"', () => {
    const leads: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng 1', brand_id: 'kia', brand_name: 'KIA', last_contact_at: '2026-07-14T09:00:00Z' }),
      L({ sales_team_id: 't1', team_name: 'Phòng 1', brand_id: 'maz', brand_name: 'Mazda', last_contact_at: '2026-07-14T10:00:00Z' }),
    ];
    const r = buildChannelReport(leads, 'NGÀY 20/07', now, {
      headerName: 'SR', teams: [{ id: 't1', name: 'Phòng 1', brand_ids: ['kia', 'maz'] }], brands: [{ id: 'kia', name: 'KIA' }, { id: 'maz', name: 'Mazda' }],
    });
    const text = renderChannelDaily(r);
    expect(text).toContain('<b>Theo thương hiệu</b>');
    expect(text).not.toContain('<b>Theo dòng xe</b>');
  });

  it('renderChannelPeriod: kênh byModel → "Theo dòng xe"', () => {
    const current: ReportLead[] = [
      L({ sales_team_id: 't1', team_name: 'Phòng Tải Bus', brand_id: TB, brand_name: 'Tải Bus', model_id: 'm-van', model_name: 'Tải Van', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
    ];
    const r = buildChannelPeriodReport(current, [], 'TUẦN 13/07–19/07', 'TUẦN 06/07–12/07', now, {
      headerName: 'Nhóm Tải Bus', teams: [{ id: 't1', name: 'Phòng Tải Bus', brand_ids: [TB] }], brands: [{ id: TB, name: 'Tải Bus' }],
    }, new Set([TB]));
    const text = renderChannelPeriod(r);
    expect(text).toContain('<b>Theo dòng xe</b>');
    expect(text).not.toContain('<b>Theo thương hiệu</b>');
  });

  it('buildLongPeriodReport: showroom byModel → perShowroom render "Theo dòng xe"', () => {
    const current: ReportLead[] = [
      L({ showroom_id: 'sr1', showroom_name: 'SR Tải Bus', brand_id: TB, brand_name: 'Tải Bus', model_id: 'm-van', model_name: 'Tải Van', status: 'KHĐ', last_contact_at: '2026-07-14T09:00:00Z' }),
    ];
    const r = buildLongPeriodReport(current, [], 'TUẦN 13/07–19/07', 'TUẦN 06/07–12/07', now, undefined, new Set([TB]));
    expect(r.perShowroom[0].text).toContain('<b>Theo dòng xe</b>');
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
    expect(text).toContain('<b>Theo thương hiệu</b>');
    expect(text).not.toContain('<b>Theo dòng xe</b>');
    // Chi tiết hiện theo TÊN HÃNG, không hiện tên dòng xe.
    expect(text).toContain('Tải Bus');
    expect(text).toContain('KIA');
    expect(text).not.toContain('Tải Van');
  });
});

describe('buildBrandReport', () => {
  const now = new Date('2026-07-20T10:00:00Z');
  const seedKM = { headerName: 'BLĐ KIA-Mazda', brands: [{ id: 'kia', name: 'KIA' }, { id: 'mz', name: 'Mazda' }] };

  it('1 hãng: tổng đúng + gom theo dòng xe, sắp theo tổng giảm dần', () => {
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

  it('seed hãng 0 lead → vẫn có khối stats 0, model rỗng', () => {
    const r = buildBrandReport([], 'NGÀY 20/07', now, seedKM);
    expect(r.blocks).toHaveLength(2);
    expect(r.blocks[0].stats.total).toBe(0);
    expect(r.blocks[0].models).toEqual([]);
  });

  it('lead ngoài tập seed bị bỏ qua (cô lập)', () => {
    const leads = [L({ brand_id: 'other', model_id: 'x', showroom_id: 's1' })];
    const r = buildBrandReport(leads, 'NGÀY 20/07', now, { headerName: 'H', brands: [{ id: 'kia', name: 'KIA' }] });
    expect(r.blocks[0].stats.total).toBe(0);
  });
});
