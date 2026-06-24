import { describe, it, expect } from 'vitest';
import { renderNewLead, renderOverdue, renderDailySr, renderDailyMgmt } from './notify-templates';

describe('notify-templates', () => {
  it('renderNewLead: gồm showroom, tên, sđt, nguồn, xe, TVBH — không emoji', () => {
    const t = renderNewLead({
      showroom: 'KIA Hà Nội', fullName: 'Nguyễn Văn A', phone: '+84901234567',
      source: 'facebook', model: 'Sonet', assignee: 'Trần B',
    });
    expect(t).toContain('LEAD MỚI');
    expect(t).toContain('KIA Hà Nội');
    expect(t).toContain('Nguyễn Văn A');
    expect(t).toContain('+84901234567');
    expect(t).toContain('Trần B');
    expect(t).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u); // không emoji
  });

  it('renderNewLead: thiếu tên → "Khách lẻ"; chưa giao → "chưa phân"', () => {
    const t = renderNewLead({ showroom: 'Mazda', fullName: null, phone: '+84909', source: null, model: null, assignee: null });
    expect(t).toContain('Khách lẻ');
    expect(t).toContain('chưa phân');
  });

  it('renderOverdue: tiêu đề có số lead, mỗi dòng có KH + TVBH + số giờ', () => {
    const t = renderOverdue('KIA Hà Nội', [
      { fullName: 'A', phone: '+8490', assignee: 'B', overdueHours: 5 },
      { fullName: null, phone: '+8491', assignee: null, overdueHours: 12 },
    ]);
    expect(t).toContain('QUÁ HẠN LIÊN HỆ');
    expect(t).toContain('(2 lead)');
    expect(t).toContain('quá hạn 5h');
    expect(t).toContain('Khách lẻ');
  });

  it('renderDailySr: có số liệu cơ bản và phân loại', () => {
    const t = renderDailySr('KIA Hà Nội', '24/06', {
      total: 10, contacted: 6, pending: 4, overdue: 2,
      KHQT: 3, GDTD: 2, KyHD: 1, Fail: 1,
    });
    expect(t).toContain('BÁO CÁO NGÀY 24/06');
    expect(t).toContain('Lead mới: 10');
    expect(t).toContain('Đã LH: 6');
    expect(t).toContain('Quá hạn: 2');
    expect(t).toContain('KHQT 3');
  });

  it('renderDailyMgmt: 1 dòng mỗi SR + đánh dấu SR cần chú ý (quá hạn cao)', () => {
    const t = renderDailyMgmt('24/06', [
      { showroom: 'KIA HN', total: 10, contacted: 9, pending: 1, overdue: 0, contactRate: 90 },
      { showroom: 'Mazda HN', total: 8, contacted: 2, pending: 6, overdue: 4, contactRate: 25 },
    ]);
    expect(t).toContain('BÁO CÁO NGÀY 24/06');
    expect(t).toContain('KIA HN');
    expect(t).toContain('Mazda HN');
    expect(t).toContain('25%');
  });
});
