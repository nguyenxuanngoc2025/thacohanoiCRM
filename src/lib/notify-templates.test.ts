import { describe, it, expect } from 'vitest';
import { renderNewLead, renderLeadAssigned, renderLeadsAssignedSummary, renderOverdue, renderDailySr, renderDailyMgmt, maskPhone } from './notify-templates';

describe('notify-templates', () => {
  it('maskPhone: hiển thị 10 chữ số (0...) + che 3 số cuối', () => {
    expect(maskPhone('+84901234567')).toBe('0901234***'); // +84 → 0, che 3 số cuối
    expect(maskPhone('0901234567')).toBe('0901234***');
    expect(maskPhone('123')).toBe('***');
  });

  it('renderNewLead: gồm showroom, tên, sđt CHE 3 số cuối, nguồn, xe, tình trạng — không emoji', () => {
    const t = renderNewLead({
      showroom: 'KIA Hà Nội', fullName: 'Nguyễn Văn A', phone: '+84901234567',
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
      showroom: 'KIA', fullName: 'Nguyễn Văn A', phone: '+8490', source: 'facebook', model: 'Sonet', assignee: 'Trần B',
    });
    expect(t).toContain('<b>LEAD MỚI — KIA</b>');
    expect(t).toContain('<b>Nguyễn Văn A</b>');
    expect(t).toContain('<b>Đã giao cho Trần B</b>');
  });

  it('renderNewLead: marker đậm dùng tag <b>, KHÔNG dùng ** (tránh va dấu * của SĐT che)', () => {
    // SĐT che dùng *** ở cuối; nếu marker đậm vẫn là **...** sẽ va vào *** → parser bot bôi nhầm.
    // Dùng tag <b>/<i> (không chứa dấu *) nên SĐT che an toàn.
    const t = renderNewLead({
      showroom: 'KIA', fullName: 'Nguyễn Văn A', phone: '+84901234567', source: 'facebook', model: 'Sonet', assignee: 'B',
    });
    expect(t).toContain('0901234***');     // SĐT che giữ nguyên 3 dấu *
    expect(t).not.toContain('**LEAD');     // không còn marker ** trên tiêu đề
    expect(t).not.toContain('**Nguyễn');   // không còn marker ** trên tên
  });

  it('renderNewLead: thiếu tên → "Khách lẻ"; chưa giao → nhấn mạnh IN HOA + lời nhắc phân giao', () => {
    const t = renderNewLead({ showroom: 'Mazda', fullName: null, phone: '+84909', source: null, model: null, assignee: null });
    expect(t).toContain('Khách lẻ');
    expect(t).toContain('<b>CHƯA ĐƯỢC PHÂN GIAO</b>');
    expect(t).toContain('<i>Vào hệ thống phân giao cho TVBH.</i>');
  });

  it('renderNewLead: đã có TVBH → KHÔNG có dòng nhắc phân giao (tránh nhân đôi)', () => {
    const t = renderNewLead({ showroom: 'KIA', fullName: 'A', phone: '+8490', source: 'facebook', model: 'Sonet', assignee: 'B' });
    expect(t).not.toContain('CHƯA ĐƯỢC PHÂN GIAO');
    expect(t).not.toContain('Vào hệ thống phân giao');
  });

  it('renderNewLead: luôn hiện dòng xe quan tâm; chưa dò ra → "chưa xác định"', () => {
    const co = renderNewLead({ showroom: 'KIA', fullName: 'A', phone: '+8490', source: 'facebook', model: 'Sonet', assignee: 'B' });
    expect(co).toContain('Dòng xe quan tâm: Sonet');
    const khong = renderNewLead({ showroom: 'KIA', fullName: 'A', phone: '+8490', source: 'facebook', model: null, assignee: 'B' });
    expect(khong).toContain('Dòng xe quan tâm: chưa xác định');
  });

  it('renderNewLead: nguồn hiện nền tảng + chi tiết kênh (Lead Ads / Tin nhắn / Bình luận)', () => {
    // Facebook tách 3 nhánh — tin báo phải ghi rõ lead đến từ Lead Ads / Tin nhắn / Bình luận.
    const ads = renderNewLead({ showroom: 'KIA', fullName: 'A', phone: '+8490', source: 'facebook', model: 'Sonet', assignee: 'B' });
    expect(ads).toContain('Nguồn: Facebook · Lead Ads');
    const msg = renderNewLead({ showroom: 'KIA', fullName: 'A', phone: '+8490', source: 'fb_message', model: 'Sonet', assignee: 'B' });
    expect(msg).toContain('Nguồn: Facebook · Tin nhắn');
    const cmt = renderNewLead({ showroom: 'KIA', fullName: 'A', phone: '+8490', source: 'fb_comment', model: 'Sonet', assignee: 'B' });
    expect(cmt).toContain('Nguồn: Facebook · Bình luận');
    // Nguồn không có nhánh chi tiết → chỉ hiện nền tảng, không có dấu "·" thừa.
    const gg = renderNewLead({ showroom: 'KIA', fullName: 'A', phone: '+8490', source: 'google', model: 'Sonet', assignee: 'B' });
    expect(gg).toContain('Nguồn: Google');
    expect(gg).not.toContain('Nguồn: Google ·');
  });

  it('renderLeadAssigned: tiêu đề PHÂN GIAO, SĐT che, TVBH + lời nhắc chăm sóc đậm, không emoji', () => {
    const t = renderLeadAssigned({ showroom: 'KIA Hà Nội', fullName: 'Nguyễn Văn A', phone: '+84901234567', model: 'Sonet', assignee: 'Trần B' });
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
    const t = renderLeadAssigned({ showroom: 'Mazda', fullName: null, phone: '+8490', model: null, assignee: 'C' });
    expect(t).toContain('Khách lẻ');
    expect(t).toContain('Dòng xe quan tâm: chưa xác định');
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
