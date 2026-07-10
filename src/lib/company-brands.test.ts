import { describe, it, expect } from 'vitest';
import { isBrandClosed } from './company-brands';

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
