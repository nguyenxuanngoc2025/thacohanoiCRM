import { describe, it, expect } from 'vitest';
import { isBrandClosed, isShowroomInactive } from './company-brands';

describe('isBrandClosed', () => {
  it('whitelist rỗng → coi như KHÔNG lọc (mọi hãng đều mở)', () => {
    expect(isBrandClosed([], 'kia')).toBe(false);
    expect(isBrandClosed([], null)).toBe(false);
  });

  it('brand nằm trong whitelist → mở', () => {
    expect(isBrandClosed(['kia', 'mazda'], 'kia')).toBe(false);
  });

  it('brand KHÔNG trong whitelist non-empty → đóng', () => {
    expect(isBrandClosed(['kia', 'mazda'], 'taibus')).toBe(true);
  });

  it('brand null nhưng có whitelist → không coi là đóng (không có hãng để chặn)', () => {
    expect(isBrandClosed(['kia'], null)).toBe(false);
  });
});

describe('isShowroomInactive', () => {
  it('danh sách tắt rỗng → mọi showroom đều active', () => {
    expect(isShowroomInactive([], 'sr1')).toBe(false);
    expect(isShowroomInactive([], null)).toBe(false);
  });

  it('showroom nằm trong danh sách tắt → inactive', () => {
    expect(isShowroomInactive(['sr1', 'sr2'], 'sr1')).toBe(true);
  });

  it('showroom KHÔNG nằm trong danh sách tắt → active', () => {
    expect(isShowroomInactive(['sr1'], 'sr2')).toBe(false);
  });

  it('showroomId null → active (không có showroom để chặn)', () => {
    expect(isShowroomInactive(['sr1'], null)).toBe(false);
  });
});
