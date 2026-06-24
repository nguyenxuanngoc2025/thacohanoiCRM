import { describe, it, expect } from 'vitest';
import { normalizePhone, formatPhoneDisplay, extractPhone } from './phone';

describe('normalizePhone', () => {
  it('chuyen 0938806341 → +84938806341', () => {
    expect(normalizePhone('0938806341')).toBe('+84938806341');
  });
  it('giu nguyen +84938806341', () => {
    expect(normalizePhone('+84938806341')).toBe('+84938806341');
  });
  it('xu ly 84938806341 → +84938806341', () => {
    expect(normalizePhone('84938806341')).toBe('+84938806341');
  });
  it('bo khoang trang/dau cham/gach: 093 880 63 41', () => {
    expect(normalizePhone('093 880 63 41')).toBe('+84938806341');
  });
  it('tra null cho rong/khong hop le', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
  });
});

describe('extractPhone', () => {
  it('tim SDT trong comment co van ban', () => {
    expect(extractPhone('cho em xin gia, sdt 0938806341 nhe')).toBe('+84938806341');
  });
  it('tim SDT co dau cach/cham', () => {
    expect(extractPhone('lien he 0938.806.341 ạ')).toBe('+84938806341');
  });
  it('tim SDT dang +84', () => {
    expect(extractPhone('call me +84938806341')).toBe('+84938806341');
  });
  it('tra null khi khong co SDT', () => {
    expect(extractPhone('san pham nay gia bao nhieu vay shop')).toBeNull();
    expect(extractPhone(null)).toBeNull();
  });
});

describe('formatPhoneDisplay', () => {
  it('+84938806341 → 0938806341', () => {
    expect(formatPhoneDisplay('+84938806341')).toBe('0938806341');
  });
  it('null/rong → chuoi rong', () => {
    expect(formatPhoneDisplay(null)).toBe('');
  });
});
