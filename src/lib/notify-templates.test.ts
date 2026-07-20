import { describe, it, expect } from 'vitest';
import { renderNewLead, renderLeadAssigned, renderLeadsAssignedSummary, renderRosterMissing, renderOverdue, renderCallbackReminder, renderDailySr, renderDailyMgmt, maskPhone, renderChannelDaily, renderBrandReport, type ChannelReportView } from './notify-templates';

const stats = (o: Partial<{ total: number; contacted: number; pending: number; overdue: number; KHQT: number; GDTD: number; KyHD: number; Fail: number }> = {}) =>
  ({ total: 0, contacted: 0, pending: 0, overdue: 0, KHQT: 0, GDTD: 0, KyHD: 0, Fail: 0, ...o });

describe('renderChannelDaily', () => {
  it('nhiều phòng: có TỔNG QUAN + từng PHÒNG + tách hãng khi >1 hãng', () => {
    const view: ChannelReportView = {
      dateLabel: 'NGÀY 11/07',
      headerName: 'Showroom PVD',
      overview: {
        stats: stats({ total: 3, contacted: 2, pending: 1 }),
        brands: [
          { name: 'KIA', stats: stats({ total: 2, contacted: 1 }) },
          { name: 'Mazda', stats: stats({ total: 1, contacted: 1 }) },
        ],
        byModel: false,
      },
      phongs: [
        { name: 'Phòng 1', stats: stats({ total: 2 }), brands: [
          { name: 'KIA', stats: stats({ total: 1 }) },
          { name: 'Mazda', stats: stats({ total: 1 }) },
        ], byModel: false, nonCompliant: [] },
        { name: 'Phòng 2', stats: stats({ total: 1 }), brands: [
          { name: 'KIA', stats: stats({ total: 1 }) },
        ], byModel: false, nonCompliant: [] },
      ],
    };
    const t = renderChannelDaily(view);
    expect(t).toContain('BÁO CÁO NGÀY 11/07 — Showroom PVD');
    expect(t).toContain('<b>TỔNG QUAN</b>');
    expect(t).toContain('Chi tiết theo thương hiệu:');
    expect(t).toContain('· KIA — Tổng 2');
    expect(t).toContain('<b>PHÒNG Phòng 1</b>');
    expect(t).toContain('<b>PHÒNG Phòng 2</b>');
  });

  it('kênh 1 phòng: bỏ TỔNG QUAN, hiện thẳng 1 khối', () => {
    const view: ChannelReportView = {
      dateLabel: 'NGÀY 11/07', headerName: 'SR',
      overview: { stats: stats({ total: 1 }), brands: [], byModel: false },
      phongs: [{ name: 'Phòng Duy Nhất', stats: stats({ total: 1, contacted: 1 }), brands: [], byModel: false, nonCompliant: [] }],
    };
    const t = renderChannelDaily(view);
    expect(t).toContain('BÁO CÁO NGÀY 11/07 — Phòng Duy Nhất');
    expect(t).not.toContain('TỔNG QUAN');
  });

  it('1 hãng: vẫn hiện chi tiết theo thương hiệu (không rút gọn)', () => {
    const view: ChannelReportView = {
      dateLabel: 'NGÀY 11/07', headerName: 'SR',
      overview: { stats: stats({ total: 1 }), brands: [], byModel: false },
      phongs: [{ name: 'P1', stats: stats({ total: 0 }), brands: [
        { name: 'KIA', stats: stats({ total: 0 }) },
      ], byModel: false, nonCompliant: [] }],
    };
    const t = renderChannelDaily(view);
    expect(t).toContain('Chi tiết theo thương hiệu:');
    expect(t).toContain('· KIA — Tổng 0');
  });
});

describe('renderNewLead tiêu đề', () => {
  it('có tên phòng → tiêu đề theo phòng', () => {
    const t = renderNewLead({ showroom: 'SR PVD', team: 'Phòng KD 1', fullName: 'A', phone: '0912345678', source: 'facebook', model: 'Seltos', assignee: null });
    expect(t).toContain('LEAD MỚI — Phòng KD 1');
  });
  it('chưa có phòng → fallback showroom', () => {
    const t = renderNewLead({ showroom: 'SR PVD', team: null, fullName: 'A', phone: '0912345678', source: 'facebook', model: null, assignee: 'B' });
    expect(t).toContain('LEAD MỚI — SR PVD');
  });
});

describe('notify-templates', () => {
  it('maskPhone: hiển thị 10 chữ số (0...) + che 3 số cuối', () => {
    expect(maskPhone('+84901234567')).toBe('0901234***'); // +84 → 0, che 3 số cuối
    expect(maskPhone('0901234567')).toBe('0901234***');
    expect(maskPhone('123')).toBe('***');
  });

  it('renderNewLead: gồm showroom, tên, sđt CHE 3 số cuối, nguồn, xe, tình trạng — không emoji', () => {
    const t = renderNewLead({
      showroom: 'KIA Hà Nội', team: null, fullName: 'Nguyễn Văn A', phone: '+84901234567',
      source: 'facebook', model: 'Sonet', assignee: 'Trần B',
    });
    expect(t).toContain('LEAD MỚI');
    expect(t).toContain('KIA Hà Nội');
    expect(t).toContain('Nguyễn Văn A');
    expect(t).toContain('0901234***');        // SĐT dạng 10 chữ số, che 3 số cuối
    expect(t).not.toContain('+84');           // KHÔNG dùng +84
    expect(t).not.toContain('0901234567');    // KHÔNG lộ SĐT đầy đủ
    expect(t).toContain('Đã giao cho Trần B'); // có TVBH → trạng thái đã giao
    expect(t).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u); // không emoji
  });

  it('renderNewLead: tên + tiêu đề + tình trạng được bọc đậm (<b>...</b>)', () => {
    const t = renderNewLead({
      showroom: 'KIA', team: null, fullName: 'Nguyễn Văn A', phone: '+8490', source: 'facebook', model: 'Sonet', assignee: 'Trần B',
    });
    expect(t).toContain('<b>LEAD MỚI — KIA</b>');
    expect(t).toContain('<b>Nguyễn Văn A</b>');
    expect(t).toContain('<b>Đã giao cho Trần B</b>');
  });

  it('renderNewLead: marker đậm dùng tag <b>, KHÔNG dùng ** (tránh va dấu * của SĐT che)', () => {
    // SĐT che dùng *** ở cuối; nếu marker đậm vẫn là **...** sẽ va vào *** → parser bot bôi nhầm.
    // Dùng tag <b>/<i> (không chứa dấu *) nên SĐT che an toàn.
    const t = renderNewLead({
      showroom: 'KIA', team: null, fullName: 'Nguyễn Văn A', phone: '+84901234567', source: 'facebook', model: 'Sonet', assignee: 'B',
    });
    expect(t).toContain('0901234***');     // SĐT che giữ nguyên 3 dấu *
    expect(t).not.toContain('**LEAD');     // không còn marker ** trên tiêu đề
    expect(t).not.toContain('**Nguyễn');   // không còn marker ** trên tên
  });

  it('renderNewLead: thiếu tên → "Khách lẻ"; chưa giao → nhấn mạnh IN HOA + lời nhắc phân giao', () => {
    const t = renderNewLead({ showroom: 'Mazda', team: null, fullName: null, phone: '+84909', source: null, model: null, assignee: null });
    expect(t).toContain('Khách lẻ');
    expect(t).toContain('<b>CHƯA ĐƯỢC PHÂN GIAO</b>');
    expect(t).toContain('<i>Vào hệ thống phân giao cho TVBH.</i>');
  });

  it('renderNewLead: đã có TVBH → KHÔNG có dòng nhắc phân giao (tránh nhân đôi)', () => {
    const t = renderNewLead({ showroom: 'KIA', team: null, fullName: 'A', phone: '+8490', source: 'facebook', model: 'Sonet', assignee: 'B' });
    expect(t).not.toContain('CHƯA ĐƯỢC PHÂN GIAO');
    expect(t).not.toContain('Vào hệ thống phân giao');
  });

  it('renderNewLead: luôn hiện dòng xe quan tâm; chưa dò ra → "chưa xác định"', () => {
    const co = renderNewLead({ showroom: 'KIA', team: null, fullName: 'A', phone: '+8490', source: 'facebook', model: 'Sonet', assignee: 'B' });
    expect(co).toContain('Dòng xe quan tâm: Sonet');
    const khong = renderNewLead({ showroom: 'KIA', team: null, fullName: 'A', phone: '+8490', source: 'facebook', model: null, assignee: 'B' });
    expect(khong).toContain('Dòng xe quan tâm: chưa xác định');
  });

  it('renderNewLead: nguồn hiện nền tảng + chi tiết kênh (Lead Ads / Tin nhắn / Bình luận)', () => {
    // Facebook tách 3 nhánh — tin báo phải ghi rõ lead đến từ Lead Ads / Tin nhắn / Bình luận.
    const ads = renderNewLead({ showroom: 'KIA', team: null, fullName: 'A', phone: '+8490', source: 'facebook', model: 'Sonet', assignee: 'B' });
    expect(ads).toContain('Nguồn: Facebook · Lead Ads');
    const msg = renderNewLead({ showroom: 'KIA', team: null, fullName: 'A', phone: '+8490', source: 'fb_message', model: 'Sonet', assignee: 'B' });
    expect(msg).toContain('Nguồn: Facebook · Tin nhắn');
    const cmt = renderNewLead({ showroom: 'KIA', team: null, fullName: 'A', phone: '+8490', source: 'fb_comment', model: 'Sonet', assignee: 'B' });
    expect(cmt).toContain('Nguồn: Facebook · Bình luận');
    // Nguồn không có nhánh chi tiết → chỉ hiện nền tảng, không có dấu "·" thừa.
    const gg = renderNewLead({ showroom: 'KIA', team: null, fullName: 'A', phone: '+8490', source: 'google', model: 'Sonet', assignee: 'B' });
    expect(gg).toContain('Nguồn: Google');
    expect(gg).not.toContain('Nguồn: Google ·');
  });

  it('renderLeadAssigned: tiêu đề PHÂN GIAO, SĐT che, TVBH + lời nhắc chăm sóc đậm, không emoji', () => {
    const t = renderLeadAssigned({ showroom: 'KIA Hà Nội', team: null, fullName: 'Nguyễn Văn A', phone: '+84901234567', model: 'Sonet', assignee: 'Trần B' });
    expect(t).toContain('<b>PHÂN GIAO — KIA Hà Nội</b>');
    expect(t).toContain('<b>Nguyễn Văn A</b>');
    expect(t).toContain('0901234***');
    expect(t).not.toContain('0901234567');
    expect(t).toContain('Dòng xe quan tâm: Sonet');
    expect(t).toContain('Giao cho: <b>Trần B</b>');
    expect(t).toContain('<b>Yêu cầu vào chăm sóc ngay.</b>');
    expect(t).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('renderLeadAssigned: thiếu tên → Khách lẻ; chưa dò xe → chưa xác định', () => {
    const t = renderLeadAssigned({ showroom: 'Mazda', team: null, fullName: null, phone: '+8490', model: null, assignee: 'C' });
    expect(t).toContain('Khách lẻ');
    expect(t).toContain('Dòng xe quan tâm: chưa xác định');
  });

  it('renderRosterMissing: nhắc đặt lịch phòng trực, có tên showroom + ngày, không emoji', () => {
    const t = renderRosterMissing('KIA Hà Nội', '11/07');
    expect(t).toContain('<b>NHẮC LỊCH PHÒNG NHẬN — KIA Hà Nội</b>');
    expect(t).toContain('(11/07)');
    expect(t).toContain('<b>CHƯA phân giao</b>');
    expect(t).toContain('Cài đặt → Phân giao');
    expect(t).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('renderLeadsAssignedSummary: tổng đậm + liệt kê TVBH/số lead + lời nhắc đậm', () => {
    const t = renderLeadsAssignedSummary('KIA Hà Nội', 5, [{ name: 'An', count: 2 }, { name: 'Bình', count: 3 }]);
    expect(t).toContain('<b>PHÂN GIAO — KIA Hà Nội</b>');
    expect(t).toContain('<b>5</b> lead vừa được giao:');
    expect(t).toContain('• An — 2 lead');
    expect(t).toContain('• Bình — 3 lead');
    expect(t).toContain('<b>Yêu cầu các TVBH vào chăm sóc ngay.</b>');
  });

  it('renderOverdue: tóm tắt tổng + chưa giao + lâu nhất, nêu lead gấp, SĐT che', () => {
    const t = renderOverdue('KIA Hà Nội', [
      { fullName: 'A', phone: '+84901234567', assignee: 'B', overdueHours: 5 },
      { fullName: null, phone: '+84909876543', assignee: null, overdueHours: 12 },
    ]);
    expect(t).toContain('QUÁ HẠN LIÊN HỆ');
    expect(t).toContain('Tổng <b>2</b> lead');
    expect(t).toContain('Chưa phân giao 1 · Đã giao 1');
    expect(t).toContain('Quá hạn lâu nhất: 12h');   // lấy max
    expect(t).toContain('Khách lẻ');
    expect(t).toContain('0901234***');         // SĐT dạng 10 chữ số, che 3 số cuối
    expect(t).not.toContain('+84');            // KHÔNG dùng +84
    expect(t).not.toContain('0901234567');     // KHÔNG lộ đầy đủ
    expect(t).toContain('Vào hệ thống');        // lời nhắc hành động
  });

  it('renderOverdue: nhiều lead → tin ngắn, chỉ nêu top, phần dư gói "… và N lead khác"', () => {
    const items = Array.from({ length: 92 }, (_, i) => ({
      fullName: `KH ${i}`, phone: '+84901234567', assignee: 'B', overdueHours: i + 1,
    }));
    const t = renderOverdue('KIA Hà Nội', items);
    expect(t).toContain('Tổng <b>92</b> lead');     // số liệu tổng đúng
    const lineCount = t.split('\n').filter((l) => l.startsWith('•')).length;
    expect(lineCount).toBeLessThanOrEqual(3);         // chỉ nêu top 3 lead gấp nhất
    expect(t).toContain('… và 89 lead khác.');        // phần dư gói gọn
    expect(t).toContain('92h');                       // top nêu lead quá hạn lâu nhất
    expect(t.length).toBeLessThan(600);               // tin gọn, dễ đọc
  });

  it('renderCallbackReminder: nhắc gọi lại, nêu số lần gọi hụt, SĐT che, tinh tế', () => {
    const t = renderCallbackReminder('KIA Hà Nội', [
      { fullName: 'A', phone: '+84901234567', assignee: 'B', noAnswerCount: 1 },
      { fullName: null, phone: '+84909876543', assignee: 'C', noAnswerCount: 2 },
    ]);
    expect(t).toContain('CẦN GỌI LẠI');
    expect(t).toContain('<b>2</b> khách chưa liên hệ được');
    expect(t).toContain('đã gọi 2 lần'); // top nêu khách gọi hụt nhiều nhất trước
    expect(t).toContain('Khách lẻ');
    expect(t).toContain('0901234***');
    expect(t).not.toContain('+84');
    expect(t).toContain('liên hệ lại khách');
  });

  it('renderCallbackReminder: nhiều khách → gói "… và N khách khác"', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      fullName: `KH ${i}`, phone: '+84901234567', assignee: 'B', noAnswerCount: (i % 3) + 1,
    }));
    const t = renderCallbackReminder('KIA Hà Nội', items);
    expect(t).toContain('<b>10</b> khách');
    const lineCount = t.split('\n').filter((l) => l.startsWith('•')).length;
    expect(lineCount).toBeLessThanOrEqual(3);
    expect(t).toContain('… và 7 khách khác.');
  });

  it('renderDailySr: tổng lead, tỷ lệ LH, phân loại, dòng chưa tuân thủ', () => {
    const t = renderDailySr('KIA Hà Nội', 'NGÀY 24/06', {
      total: 10, contacted: 6, pending: 4, overdue: 2,
      KHQT: 3, GDTD: 2, KyHD: 1, Fail: 1,
    }, [{ name: 'Trần B', overdue: 2 }]);
    expect(t).toContain('BÁO CÁO NGÀY 24/06');
    expect(t).toContain('Tổng lead: 10');
    expect(t).toContain('Đã LH: 6 (60%)');
    expect(t).toContain('Quá hạn: 2');
    expect(t).toContain('KHQT 3');
    expect(t).toContain('Chưa tuân thủ: Trần B (2 lead quá hạn)');
  });

  it('renderDailySr: không ai quá hạn → "Chưa tuân thủ: không có"', () => {
    const t = renderDailySr('KIA HN', 'NGÀY 24/06', {
      total: 5, contacted: 5, pending: 0, overdue: 0, KHQT: 0, GDTD: 0, KyHD: 0, Fail: 0,
    }, []);
    expect(t).toContain('Chưa tuân thủ: không có');
  });

  it('renderDailyMgmt: dòng TỔNG + tỷ lệ LH + đánh dấu SR cần chú ý', () => {
    const t = renderDailyMgmt('NGÀY 24/06', [
      { showroom: 'KIA HN', total: 10, contacted: 9, pending: 1, overdue: 0, contactRate: 90 },
      { showroom: 'Mazda HN', total: 8, contacted: 2, pending: 6, overdue: 4, contactRate: 25 },
    ], { total: 18, contacted: 11, overdue: 4 });
    expect(t).toContain('BÁO CÁO NGÀY 24/06');
    expect(t).toContain('TỔNG: 18 lead · Đã LH 11 (61%) · Quá hạn 4');
    expect(t).toContain('KIA HN');
    expect(t).toContain('Mazda HN');
    expect(t).toContain('25%');
    expect(t).toContain('[cần chú ý]');
  });
});

describe('renderBrandReport', () => {
  const view = {
    dateLabel: 'NGÀY 20/07',
    headerName: 'BLĐ KIA-Mazda',
    blocks: [
      {
        brandName: 'KIA',
        stats: stats({ total: 3, contacted: 1, pending: 2, overdue: 1, KHQT: 1 }),
        models: [{ name: 'Sonet', stats: stats({ total: 2 }) }],
        showrooms: [{ name: 'SR A', stats: stats({ total: 2 }) }],
      },
      {
        brandName: 'Mazda',
        stats: stats({ total: 0 }),
        models: [],
        showrooms: [],
      },
    ],
  };

  it('tiêu đề khối + 2 mục theo dòng xe/showroom', () => {
    const t = renderBrandReport(view);
    expect(t).toContain('<b>BÁO CÁO NGÀY 20/07 — BLĐ KIA-Mazda · KIA</b>');
    expect(t).toContain('Tổng lead: 3');
    expect(t).toContain('Theo dòng xe:');
    expect(t).toContain('· Sonet — Tổng 2');
    expect(t).toContain('Theo showroom:');
    expect(t).toContain('· SR A — Tổng 2');
  });

  it('hãng 0 lead: vẫn có khối + "chưa có" cho danh sách rỗng', () => {
    const t = renderBrandReport(view);
    expect(t).toContain('<b>BÁO CÁO NGÀY 20/07 — BLĐ KIA-Mazda · Mazda</b>');
    expect(t).toContain('· chưa có');
  });
});
