// app/src/lib/b10.test.ts
import { describe, it, expect } from 'vitest';
import { bestB10Status, normalizeB10Status } from './b10';

describe('bestB10Status', () => {
  it('không bao giờ tụt hạng — lấy mức cao nhất', () => {
    expect(bestB10Status(null, 'KHQT')).toBe('KHQT');
    expect(bestB10Status('KHQT', null)).toBe('KHQT');
    expect(bestB10Status('KHQT', 'KHĐ')).toBe('KHĐ');
    expect(bestB10Status('KHĐ', 'KHQT')).toBe('KHĐ');
    expect(bestB10Status('Fail', 'Chưa LH được')).toBe('Fail');
    expect(bestB10Status(null, null)).toBeNull();
  });

  it('thứ tự đầy đủ: Chưa LH được < Fail < KHQT < GDTD < KHĐ', () => {
    expect(bestB10Status('Chưa LH được', 'Fail')).toBe('Fail');
    expect(bestB10Status('Fail', 'KHQT')).toBe('KHQT');
    expect(bestB10Status('KHQT', 'GDTD')).toBe('GDTD');
    expect(bestB10Status('GDTD', 'KHĐ')).toBe('KHĐ');
  });
});

describe('normalizeB10Status', () => {
  it('khớp mã chuẩn (không phân biệt hoa/thường, khoảng trắng)', () => {
    expect(normalizeB10Status('KHQT')).toBe('KHQT');
    expect(normalizeB10Status(' khđ ')).toBe('KHĐ');
    expect(normalizeB10Status('gdtd')).toBe('GDTD');
    expect(normalizeB10Status('chưa lh được')).toBe('Chưa LH được');
    expect(normalizeB10Status('fail')).toBe('Fail');
  });

  it('giá trị rỗng/lạ → null', () => {
    expect(normalizeB10Status('')).toBeNull();
    expect(normalizeB10Status(null)).toBeNull();
    expect(normalizeB10Status('xyz')).toBeNull();
  });
});
