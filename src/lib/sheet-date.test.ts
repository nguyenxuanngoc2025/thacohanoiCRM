import { describe, it, expect } from 'vitest';
import { parseSheetDate, isOnOrAfter } from './sheet-date';

// So sánh theo các thành phần năm/tháng/ngày (parse bằng Date.UTC) — không lệ thuộc múi giờ máy chạy.
const ymd = (d: Date | null) => (d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` : null);

describe('parseSheetDate', () => {
  it('định dạng VN dd/mm/yyyy', () => {
    expect(ymd(parseSheetDate('28/06/2026'))).toBe('2026-06-28');
    expect(ymd(parseSheetDate('01/12/2025'))).toBe('2025-12-01');
  });

  it('VN có giờ: dd/mm/yyyy hh:mm[:ss]', () => {
    expect(ymd(parseSheetDate('28/06/2026 14:30'))).toBe('2026-06-28');
    expect(ymd(parseSheetDate('28/06/2026 14:30:05'))).toBe('2026-06-28');
  });

  it('dd-mm-yyyy', () => {
    expect(ymd(parseSheetDate('28-06-2026'))).toBe('2026-06-28');
  });

  it('ISO yyyy-mm-dd và yyyy-mm-dd hh:mm', () => {
    expect(ymd(parseSheetDate('2026-06-28'))).toBe('2026-06-28');
    expect(ymd(parseSheetDate('2026-06-28 09:15'))).toBe('2026-06-28');
    expect(ymd(parseSheetDate('2026-06-28T09:15:00'))).toBe('2026-06-28');
  });

  it('số serial của Google Sheets (ngày kể từ 1899-12-30)', () => {
    // Mốc đã kiểm chứng: 44197 = 2021-01-01 ; 45658 = 2025-01-01
    expect(ymd(parseSheetDate('44197'))).toBe('2021-01-01');
    expect(ymd(parseSheetDate('45658'))).toBe('2025-01-01');
  });

  it('rỗng / rác → null', () => {
    expect(parseSheetDate('')).toBeNull();
    expect(parseSheetDate('   ')).toBeNull();
    expect(parseSheetDate('không phải ngày')).toBeNull();
    expect(parseSheetDate('32/13/2026')).toBeNull(); // ngày/tháng vô lý
  });
});

describe('isOnOrAfter', () => {
  it('true khi ngày ô >= mốc; false khi trước mốc', () => {
    expect(isOnOrAfter('28/06/2026', '2026-06-28')).toBe(true);  // bằng mốc
    expect(isOnOrAfter('29/06/2026', '2026-06-28')).toBe(true);  // sau mốc
    expect(isOnOrAfter('27/06/2026', '2026-06-28')).toBe(false); // trước mốc
  });

  it('giờ trong ngày mốc vẫn tính (so theo mốc 00:00)', () => {
    expect(isOnOrAfter('28/06/2026 23:59', '2026-06-28')).toBe(true);
  });

  it('ô không parse được → false (an toàn, không nạp dòng cũ/rác)', () => {
    expect(isOnOrAfter('', '2026-06-28')).toBe(false);
    expect(isOnOrAfter('rác', '2026-06-28')).toBe(false);
  });
});
