import { describe, it, expect } from 'vitest';
import { looksLikePersonName } from './person-name';

describe('looksLikePersonName', () => {
  it('tên người thật → true (giữ nguyên, không tra)', () => {
    expect(looksLikePersonName('Nguyễn Văn A')).toBe(true);
    expect(looksLikePersonName('Nguyễn tá quang')).toBe(true);
    expect(looksLikePersonName('Lão Già')).toBe(true); // biệt danh vẫn coi là tên người
  });

  it('trống / null / placeholder → false (cần tra)', () => {
    expect(looksLikePersonName(null)).toBe(false);
    expect(looksLikePersonName('')).toBe(false);
    expect(looksLikePersonName('   ')).toBe(false);
    expect(looksLikePersonName('Khách lẻ')).toBe(false);
    expect(looksLikePersonName('khách hàng')).toBe(false); // không phân biệt hoa thường
  });

  it('slug form có gạch dưới → false (cần tra)', () => {
    expect(looksLikePersonName('nhận_báo_giá_lăn_bánh_kia_')).toBe(false);
    expect(looksLikePersonName('form_dang_ky')).toBe(false);
  });

  it('chứa từ khoá marketing (có/không dấu) → false (cần tra)', () => {
    expect(looksLikePersonName('Báo giá lăn bánh')).toBe(false);
    expect(looksLikePersonName('bao gia xe')).toBe(false);
    expect(looksLikePersonName('Đăng ký nhận ưu đãi')).toBe(false);
    expect(looksLikePersonName('khuyen mai thang 6')).toBe(false);
  });
});
