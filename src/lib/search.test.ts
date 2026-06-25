import { describe, it, expect } from 'vitest';
import { normalizeText, matchesQuery } from './search';

describe('normalizeText', () => {
  it('bỏ dấu thanh + dấu mũ', () => {
    expect(normalizeText('Nguyễn Văn Giá')).toBe('nguyen van gia');
  });
  it('đổi đ/Đ thành d', () => {
    expect(normalizeText('Đặng Đức')).toBe('dang duc');
  });
  it('thường hoá + trim', () => {
    expect(normalizeText('  HÀ NỘI  ')).toBe('ha noi');
  });
});

describe('matchesQuery — từ khoá rỗng', () => {
  it('khớp tất cả', () => {
    expect(matchesQuery('Bất kỳ', '0914155096', '')).toBe(true);
    expect(matchesQuery(null, '0914155096', '   ')).toBe(true);
  });
});

describe('matchesQuery — theo SĐT', () => {
  it('khớp tiền tố "09" với số bắt đầu 09', () => {
    expect(matchesQuery('A', '0914155096', '09')).toBe(true);
  });
  it('KHÔNG khớp tiền tố "09" với số bắt đầu 03', () => {
    expect(matchesQuery('A', '0357809517', '09')).toBe(false);
  });
  it('khớp chuỗi con ≥4 số bất kỳ trong SĐT', () => {
    expect(matchesQuery('A', '0914155096', '5096')).toBe(true);
    expect(matchesQuery('A', '0914155096', '4155')).toBe(true);
  });
  it('chuỗi <4 số chỉ khớp theo tiền tố', () => {
    expect(matchesQuery('A', '0914155096', '091')).toBe(true);  // 3 số, đúng tiền tố
    expect(matchesQuery('A', '0914155096', '914')).toBe(false); // 3 số, không phải tiền tố
    expect(matchesQuery('A', '0914155096', '50')).toBe(false);  // 2 số, không phải tiền tố
  });
  it('chuẩn hoá số quốc tế đầy đủ 84... → 0...', () => {
    expect(matchesQuery('A', '0914155096', '84914155096')).toBe(true);
  });
});

describe('matchesQuery — theo tên (không dấu)', () => {
  it('gõ không dấu khớp tên có dấu', () => {
    expect(matchesQuery('Trần Văn Giá', '0900000000', 'gia')).toBe(true);
    expect(matchesQuery('Nguyễn Đức', '0900000000', 'duc')).toBe(true);
  });
  it('khớp một phần tên', () => {
    expect(matchesQuery('Nguyễn Thị Hương', '0900000000', 'huong')).toBe(true);
  });
  it('không khớp khi tên null và từ khoá là chữ', () => {
    expect(matchesQuery(null, '0900000000', 'gia')).toBe(false);
  });
});
