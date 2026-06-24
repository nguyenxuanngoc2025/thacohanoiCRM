import { describe, it, expect } from 'vitest';
import { checkCronSecret } from './cron-auth';

describe('checkCronSecret', () => {
  it('trả false khi thiếu header', () => {
    expect(checkCronSecret(null, 'abc')).toBe(false);
  });
  it('trả false khi thiếu expected', () => {
    expect(checkCronSecret('abc', undefined)).toBe(false);
  });
  it('trả false khi không khớp', () => {
    expect(checkCronSecret('abc', 'xyz')).toBe(false);
  });
  it('trả true khi khớp', () => {
    expect(checkCronSecret('abc', 'abc')).toBe(true);
  });
});
