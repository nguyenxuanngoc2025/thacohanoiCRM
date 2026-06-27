import { describe, it, expect } from 'vitest';
import { renderNewLead, renderOverdue, renderDailySr, renderDailyMgmt, maskPhone } from './notify-templates';

describe('notify-templates', () => {
  it('maskPhone: hiển thị 10 chữ số (0...) + che 3 số cuối', () => {
    expect(maskPhone('+84901234567')).toBe('0901234***'); // +84 → 0, che 3 số cuối
    expect(maskPhone('0901234567')).toBe('0901234***');
    expect(maskPhone('123')).toBe('***');
  });

  it('renderNewLead: gồm showroom, tên, sđt CHE 3 số cuối, nguồn, xe, TVBH — không emoji', () => {
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
    expect(t).toContain('Trần B');
    expect(t).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u); // không emoji
  });

  it('renderNewLead: thiếu tên → "Khách lẻ"; chưa giao → "Chưa được phân giao"', () => {
    const t = renderNewLead({ showroom: 'Mazda', fullName: null, phone: '+84909', source: null, model: null, assignee: null });
    expect(t).toContain('Khách lẻ');
    expect(t).toContain('Chưa được phân giao');
  });

  it('renderNewLead: có model → hiện "Xe:"; không model → ẩn hẳn dòng xe', () => {
    const co = renderNewLead({ showroom: 'KIA', fullName: 'A', phone: '+8490', source: 'fb', model: 'Sonet', assignee: 'B' });
    expect(co).toContain('Xe: Sonet');
    const khong = renderNewLead({ showroom: 'KIA', fullName: 'A', phone: '+8490', source: 'fb', model: null, assignee: 'B' });
    expect(khong).not.toContain('Xe:');
    expect(khong).toContain('Nguồn: fb');
  });

  it('renderOverdue: tiêu đề có số lead, dòng có KH + TVBH + giờ, SĐT che, chưa giao ghi rõ', () => {
    const t = renderOverdue('KIA Hà Nội', [
      { fullName: 'A', phone: '+84901234567', assignee: 'B', overdueHours: 5 },
      { fullName: null, phone: '+84909876543', assignee: null, overdueHours: 12 },
    ]);
    expect(t).toContain('QUÁ HẠN LIÊN HỆ');
    expect(t).toContain('(2 lead)');
    expect(t).toContain('quá hạn 5h');
    expect(t).toContain('Khách lẻ');
    expect(t).toContain('0901234***');         // SĐT dạng 10 chữ số, che 3 số cuối
    expect(t).not.toContain('+84');            // KHÔNG dùng +84
    expect(t).not.toContain('0901234567');     // KHÔNG lộ đầy đủ
    expect(t).toContain('Chưa được phân giao'); // lead chưa giao
  });

  it('renderOverdue: nhiều lead → giới hạn số dòng, phần dư rút gọn "… và N lead khác"', () => {
    const items = Array.from({ length: 92 }, (_, i) => ({
      fullName: `KH ${i}`, phone: '+84901234567', assignee: 'B', overdueHours: 5,
    }));
    const t = renderOverdue('KIA Hà Nội', items);
    expect(t).toContain('(92 lead)');               // tiêu đề vẫn tổng đúng
    const lineCount = t.split('\n').filter((l) => l.startsWith('•')).length;
    expect(lineCount).toBeLessThanOrEqual(20);        // không liệt kê hết
    expect(t).toContain('lead khác');                 // có dòng rút gọn
    expect(t.length).toBeLessThan(2000);              // không vượt giới hạn Zalo
  });

  it('renderDailySr: tổng lead, tỷ lệ LH, phân loại, dòng chưa tuân thủ', () => {
    const t = renderDailySr('KIA Hà Nội', '24/06', {
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
    const t = renderDailySr('KIA HN', '24/06', {
      total: 5, contacted: 5, pending: 0, overdue: 0, KHQT: 0, GDTD: 0, KyHD: 0, Fail: 0,
    }, []);
    expect(t).toContain('Chưa tuân thủ: không có');
  });

  it('renderDailyMgmt: dòng TỔNG + tỷ lệ LH + đánh dấu SR cần chú ý', () => {
    const t = renderDailyMgmt('24/06', [
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
