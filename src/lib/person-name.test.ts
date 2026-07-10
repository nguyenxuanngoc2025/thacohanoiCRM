import { describe, it, expect } from 'vitest';
import { looksLikePersonName, leadNeedsNameEnrich } from './person-name';

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

describe('leadNeedsNameEnrich', () => {
  const base = { full_name: null, phone: '+84981515513', name_locked: false, name_enriched_at: null };

  it('lead tên trống, có SĐT, chưa khoá, chưa thử → cần tra', () => {
    expect(leadNeedsNameEnrich({ ...base })).toBe(true);
    expect(leadNeedsNameEnrich({ ...base, full_name: 'Báo giá lăn bánh' })).toBe(true);
  });

  it('tên người thật → KHÔNG tra', () => {
    expect(leadNeedsNameEnrich({ ...base, full_name: 'Nguyễn Văn A' })).toBe(false);
  });

  it('không có SĐT → KHÔNG tra (không tra được Zalo)', () => {
    expect(leadNeedsNameEnrich({ ...base, phone: null })).toBe(false);
    expect(leadNeedsNameEnrich({ ...base, phone: '  ' })).toBe(false);
  });

  it('user đã khoá tên → KHÔNG ghi đè', () => {
    expect(leadNeedsNameEnrich({ ...base, name_locked: true })).toBe(false);
  });

  it('đã thử tra rồi → KHÔNG tra lại (tránh lặp vô hạn)', () => {
    expect(leadNeedsNameEnrich({ ...base, name_enriched_at: '2026-07-10T00:00:00Z' })).toBe(false);
  });
});
