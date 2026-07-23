import { describe, it, expect } from 'vitest';
import { renderNewLead, renderReturningLead, renderLeadAssigned, renderLeadsAssignedSummary, renderRosterMissing, renderOverdue, renderCallbackReminder, renderUnassignedReminder, renderDailySr, renderDailyMgmt, maskPhone, renderChannelDaily, renderBrandReport, type ChannelReportView } from './notify-templates';

describe('renderUnassignedReminder', () => {
  it('gom nhiều lead 1 phòng, có tiêu đề + tổng số + danh sách', () => {
    const txt = renderUnassignedReminder('KIA MAZDA 2', [
      { fullName: 'Anh Tiến', phone: '0900000001', waitMinutes: 90 },
      { fullName: null, phone: '0900000002', waitMinutes: 130 },
    ]);
    expect(txt).toContain('CHƯA PHÂN GIAO — KIA MAZDA 2');
    expect(txt).toContain('<b>2</b>');
    expect(txt).toContain('Anh Tiến');
    expect(txt).toContain('Khách lẻ');       // fullName null → nhãn mặc định
    expect(txt).toContain('2 giờ 10 phút');   // 130 phút
  });
});

const stats = (o: Partial<{ total: number; contacted: number; pending: number; overdue: number; KHQT: number; GDTD: number; KyHD: number; Fail: number }> = {}) =>
  ({ total: 0, contacted: 0, pending: 0, overdue: 0, KHQT: 0, GDTD: 0, KyHD: 0, Fail: 0, ...o });

describe('renderReturningLead', () => {
  it('có TVBH + phân loại + nội dung hỏi', () => {
    const t = renderReturningLead({
      showroom: 'Giải Phóng', team: 'Phòng 1', fullName: 'Nam Huy', phone: '+84934447212',
      source: 'facebook', inquiry: 'Hỏi giá lăn bánh Seltos', assignee: 'Nguyễn Thành Đạt', status: 'KHQT',
    });
    expect(t).toContain('DATA KH CŨ HỎI LẠI — Phòng 1');
    expect(t).toContain('KH: <b>Nam Huy</b>');
    expect(t).toContain('0934447***');
    expect(t).toContain('Nội dung hỏi: <i>Hỏi giá lăn bánh Seltos</i>');
    expect(t).toContain('Đang chăm: <b>Nguyễn Thành Đạt</b>');
    expect(t).toContain('Phân loại hiện tại: Khách quan tâm');
  });

  it('chưa có TVBH + chưa phân loại + không có nội dung hỏi', () => {
    const t = renderReturningLead({
      showroom: 'Giải Phóng', team: null, fullName: null, phone: '+84934447212',
      source: 'zalo', inquiry: null, assignee: null, status: null,
    });
    expect(t).toContain('DATA KH CŨ HỎI LẠI — Giải Phóng');
    expect(t).toContain('KH: <b>Khách lẻ</b>');
    expect(t).toContain('Đang chăm: <b>CHƯA CÓ TVBH</b>');
    expect(t).toContain('Phân loại hiện tại: Chưa phân loại');
    expect(t).not.toContain('Nội dung hỏi:');
  });

  it('khác kênh: hiện cả kênh ban đầu lẫn kênh hỏi thêm', () => {
    const t = renderReturningLead({
      showroom: 'Giải Phóng', team: 'Phòng 1', fullName: 'Nam Huy', phone: '+84934447212',
      source: 'google', originalSource: 'facebook', inquiry: null, assignee: null, status: null,
    });
    expect(t).toContain('Kênh ban đầu: Facebook');
    expect(t).toContain('Đang hỏi thêm ở: Google');
    expect(t).not.toContain('Kênh mới:');
  });

  it('cùng kênh: chỉ hiện Kênh mới, không lặp kênh ban đầu', () => {
    const t = renderReturningLead({
      showroom: 'Giải Phóng', team: 'Phòng 1', fullName: 'Nam Huy', phone: '+84934447212',
      source: 'facebook', originalSource: 'facebook', inquiry: null, assignee: null, status: null,
    });
    expect(t).toContain('Kênh mới: Facebook');
    expect(t).not.toContain('Kênh ban đầu:');
  });
});

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
      uncontacted: [],
    };
    const t = renderChannelDaily(view);
    expect(t).toContain('Em xin kính gửi Báo cáo Ngày 11/07');
    expect(t).toContain('<b>Kính gửi Quý Anh/Chị Showroom PVD</b>');
    expect(t).toContain('<b>Theo thương hiệu</b>');
    expect(t).toContain('• <b>KIA</b>: <b>2</b> Lead');
    expect(t).toContain('<b>Theo phòng bán hàng</b>');
    expect(t).toContain('• <b>Phòng 1</b>: <b>2</b> Lead');
    expect(t).toContain('• <b>Phòng 2</b>: <b>1</b> Lead');
  });

  it('kênh 1 phòng: hiện thẳng 1 khối theo tên phòng, không có mục Theo phòng', () => {
    const view: ChannelReportView = {
      dateLabel: 'NGÀY 11/07', headerName: 'SR',
      overview: { stats: stats({ total: 1 }), brands: [], byModel: false },
      phongs: [{ name: 'Phòng Duy Nhất', stats: stats({ total: 1, contacted: 1 }), brands: [], byModel: false, nonCompliant: [] }],
      uncontacted: [],
    };
    const t = renderChannelDaily(view);
    expect(t).toContain('<b>Kính gửi Quý Anh/Chị Phòng Duy Nhất</b>');
    expect(t).not.toContain('Theo phòng bán hàng');
  });

  it('1 hãng (không phải Tải Bus): bỏ mục chi tiết cho tin gọn', () => {
    const view: ChannelReportView = {
      dateLabel: 'NGÀY 11/07', headerName: 'SR',
      overview: { stats: stats({ total: 1 }), brands: [], byModel: false },
      phongs: [{ name: 'P1', stats: stats({ total: 1 }), brands: [
        { name: 'KIA', stats: stats({ total: 1 }) },
      ], byModel: false, nonCompliant: [] }],
      uncontacted: [],
    };
    const t = renderChannelDaily(view);
    expect(t).not.toContain('Theo thương hiệu');
  });

  it('có lead + tồn đọng: hiện mục "Chưa liên hệ (tồn đọng)" gom theo TVBH, sắp giảm dần', () => {
    const view: ChannelReportView = {
      dateLabel: 'NGÀY 24/07', headerName: 'SR',
      overview: { stats: stats({ total: 1 }), brands: [], byModel: false },
      phongs: [{ name: 'Phòng 1', stats: stats({ total: 1, contacted: 1 }), brands: [], byModel: false, nonCompliant: [] }],
      uncontacted: [{ name: 'Nguyễn A', count: 3 }, { name: 'Trần B', count: 2 }],
    };
    const t = renderChannelDaily(view);
    expect(t).toContain('<b>Chưa liên hệ (tồn đọng)</b>');
    expect(t).toContain('• <b>Nguyễn A</b> — 3 KH');
    expect(t).toContain('• <b>Trần B</b> — 2 KH');
    expect(t.indexOf('Nguyễn A')).toBeLessThan(t.indexOf('Trần B'));
  });

  it('nhiều phòng: ẨN phòng 0 lead trong "Theo phòng bán hàng"', () => {
    const view: ChannelReportView = {
      dateLabel: 'NGÀY 24/07', headerName: 'SR',
      overview: { stats: stats({ total: 2 }), brands: [], byModel: false },
      phongs: [
        { name: 'Phòng Có', stats: stats({ total: 2, contacted: 1 }), brands: [], byModel: false, nonCompliant: [] },
        { name: 'Phòng Rỗng', stats: stats({ total: 0 }), brands: [], byModel: false, nonCompliant: [] },
      ],
      uncontacted: [],
    };
    const t = renderChannelDaily(view);
    expect(t).toContain('• <b>Phòng Có</b>');
    expect(t).not.toContain('Phòng Rỗng');
  });

  it('0 lead + còn tồn đọng: tin an ủi + rà soát khách chưa liên hệ', () => {
    const view: ChannelReportView = {
      dateLabel: 'NGÀY 24/07', headerName: 'SR',
      overview: { stats: stats({ total: 0 }), brands: [], byModel: false },
      phongs: [{ name: 'Phòng KIA 1', stats: stats({ total: 0 }), brands: [], byModel: false, nonCompliant: [] }],
      uncontacted: [{ name: 'Nguyễn A', count: 3 }],
    };
    const t = renderChannelDaily(view);
    expect(t).toContain('<b>Kính gửi Quý Anh/Chị Phòng KIA 1</b>');
    expect(t).toContain('Hôm nay không có Lead mới. Kính đề nghị Quý Anh/Chị rà soát các khách chưa được liên hệ dưới đây:');
    expect(t).toContain('• <b>Nguyễn A</b> — 3 KH');
  });

  it('0 lead + 0 tồn đọng: tin an ủi "đã được liên hệ chăm sóc đầy đủ"', () => {
    const view: ChannelReportView = {
      dateLabel: 'NGÀY 24/07', headerName: 'SR',
      overview: { stats: stats({ total: 0 }), brands: [], byModel: false },
      phongs: [{ name: 'Phòng KIA 1', stats: stats({ total: 0 }), brands: [], byModel: false, nonCompliant: [] }],
      uncontacted: [],
    };
    const t = renderChannelDaily(view);
    expect(t).toContain('Hôm nay không có Lead mới. Toàn bộ khách cũ đã được liên hệ chăm sóc đầy đủ.');
    expect(t).not.toContain('Chưa liên hệ (tồn đọng)');
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
    expect(t).toContain('<b>5</b> Lead vừa được giao:');
    expect(t).toContain('• An — 2 Lead');
    expect(t).toContain('• Bình — 3 Lead');
    expect(t).toContain('<b>Yêu cầu các TVBH vào chăm sóc ngay.</b>');
  });

  it('renderOverdue: tóm tắt tổng + chưa giao + lâu nhất, nêu lead gấp, SĐT che', () => {
    const t = renderOverdue('KIA Hà Nội', [
      { fullName: 'A', phone: '+84901234567', assignee: 'B', overdueMinutes: 5 * 60 },
      { fullName: null, phone: '+84909876543', assignee: null, overdueMinutes: 12 * 60 },
    ]);
    expect(t).toContain('QUÁ HẠN LIÊN HỆ');
    expect(t).toContain('Tổng <b>2</b> Lead');
    expect(t).toContain('Chưa phân giao 1 · Đã giao 1');
    expect(t).toContain('Quá hạn lâu nhất: 12 giờ');   // lấy max
    expect(t).toContain('Khách lẻ');
    expect(t).toContain('0901234***');         // SĐT dạng 10 chữ số, che 3 số cuối
    expect(t).not.toContain('+84');            // KHÔNG dùng +84
    expect(t).not.toContain('0901234567');     // KHÔNG lộ đầy đủ
    expect(t).toContain('Vào hệ thống');        // lời nhắc hành động
  });

  it('renderOverdue: liệt kê đầy đủ tới ngưỡng 30, gấp nhất trước, dư mới gói "… và N lead khác"', () => {
    const items = Array.from({ length: 92 }, (_, i) => ({
      fullName: `KH ${i}`, phone: '+84901234567', assignee: 'B', overdueMinutes: (i + 1) * 60,
    }));
    const t = renderOverdue('KIA Hà Nội', items);
    expect(t).toContain('Tổng <b>92</b> Lead');     // số liệu tổng đúng
    const lineCount = t.split('\n').filter((l) => l.startsWith('•')).length;
    expect(lineCount).toBe(30);                        // liệt kê tới ngưỡng an toàn 30
    expect(t).toContain('… và 62 Lead khác.');        // phần dư (92-30) gói gọn
    expect(t).toContain('92 giờ');                    // gấp nhất (chờ lâu nhất) nêu đầu tiên
  });

  it('renderOverdue: ít hơn ngưỡng → liệt kê hết, KHÔNG có dòng "… và N khác"', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      fullName: `KH ${i}`, phone: '+84901234567', assignee: null, overdueMinutes: (i + 1) * 60,
    }));
    const t = renderOverdue('KIA Hà Nội', items);
    const lineCount = t.split('\n').filter((l) => l.startsWith('•')).length;
    expect(lineCount).toBe(8);                         // liệt kê toàn bộ 8 KH
    expect(t).not.toContain('Lead khác.');            // không dư → không gói
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

  it('renderDailySr: tổng Lead in đậm, có KHQT, dòng chưa tuân thủ (tên đậm)', () => {
    const t = renderDailySr('KIA Hà Nội', 'NGÀY 24/06', {
      total: 10, contacted: 6, pending: 4, overdue: 2,
      KHQT: 3, GDTD: 2, KyHD: 1, Fail: 1,
    }, [{ name: 'Trần B', overdue: 2 }]);
    expect(t).toContain('Em xin kính gửi Báo cáo Ngày 24/06');
    expect(t).toContain('<b>Kính gửi Quý Anh/Chị KIA Hà Nội</b>');
    expect(t).toContain('Tổng Lead: <b>10</b>');
    expect(t).toContain('đã liên hệ <b>6</b>');
    expect(t).toContain('Có <b>3</b> KHQT');
    expect(t).toContain('<b>Chưa tuân thủ</b>');
    expect(t).toContain('• <b>Trần B</b> — 2 Lead quá hạn chưa liên hệ');
  });

  it('renderDailySr: không ai quá hạn → ẨN hẳn mục "Chưa tuân thủ"', () => {
    const t = renderDailySr('KIA HN', 'NGÀY 24/06', {
      total: 5, contacted: 5, pending: 0, overdue: 0, KHQT: 0, GDTD: 0, KyHD: 0, Fail: 0,
    }, []);
    expect(t).not.toContain('Chưa tuân thủ');
    expect(t).not.toContain('Không có Lead quá hạn');
  });

  it('renderDailySr: 0 lead → tin an ủi trang trọng', () => {
    const t = renderDailySr('KIA HN', 'NGÀY 24/06', {
      total: 0, contacted: 0, pending: 0, overdue: 0, KHQT: 0, GDTD: 0, KyHD: 0, Fail: 0,
    }, []);
    expect(t).toContain('<b>Kính gửi Quý Anh/Chị KIA HN</b>');
    expect(t).toContain('Hôm nay không có Lead mới. Toàn bộ khách cũ đã được liên hệ chăm sóc đầy đủ.');
  });

  it('renderDailyMgmt: dòng tổng + chi tiết Theo thương hiệu', () => {
    const t = renderDailyMgmt('NGÀY 24/06',
      stats({ total: 18, contacted: 11, overdue: 4, KHQT: 5 }),
      [
        { name: 'KIA', stats: stats({ total: 10, contacted: 9, KHQT: 3 }) },
        { name: 'Mazda', stats: stats({ total: 8, contacted: 2, KHQT: 2 }) },
      ]);
    expect(t).toContain('Em xin kính gửi Báo cáo Ngày 24/06');
    expect(t).toContain('Kính gửi Quý Ban lãnh đạo cùng các Anh/Chị');
    expect(t).toContain('Tổng Lead: <b>18</b>');
    expect(t).toContain('<b>Theo thương hiệu</b>');
    expect(t).toContain('• <b>KIA</b>: <b>10</b> Lead');
    expect(t).toContain('• <b>Mazda</b>: <b>8</b> Lead');
  });

  it('renderDailyMgmt: byModel → mục Theo dòng xe', () => {
    const t = renderDailyMgmt('NGÀY 24/06',
      stats({ total: 5 }),
      [{ name: 'Xe Tải', stats: stats({ total: 5 }) }], true);
    expect(t).toContain('<b>Theo dòng xe</b>');
    expect(t).toContain('• <b>Xe Tải</b>: <b>5</b> Lead');
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
      },
      {
        brandName: 'Mazda',
        stats: stats({ total: 0 }),
        models: [],
      },
    ],
  };

  it('tiêu đề khối + mục theo dòng xe', () => {
    const t = renderBrandReport(view);
    expect(t).toContain('Em xin kính gửi Báo cáo Ngày 20/07');
    expect(t).toContain('<b>Kính gửi Quý Anh/Chị PKD Thương hiệu KIA</b>');
    expect(t).toContain('Tổng Lead: <b>3</b>');
    expect(t).toContain('<b>Theo dòng xe</b>');
    expect(t).toContain('• <b>Sonet</b>: <b>2</b> Lead');
  });

  it('hãng 0 lead: vẫn có khối + "chưa có" cho danh sách rỗng', () => {
    const t = renderBrandReport(view);
    expect(t).toContain('<b>Kính gửi Quý Anh/Chị PKD Thương hiệu Mazda</b>');
    expect(t).toContain('• chưa có');
  });
});
