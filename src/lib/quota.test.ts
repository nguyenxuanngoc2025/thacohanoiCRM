import { describe, it, expect } from 'vitest';
import { isShowroomQuotaReached, disallowedBrandIds } from './quota';

describe('isShowroomQuotaReached', () => {
  it('chưa đạt khi đang dùng ít hơn quota', () => {
    expect(isShowroomQuotaReached(5, 8)).toBe(false);
  });
  it('đạt khi bằng quota', () => {
    expect(isShowroomQuotaReached(8, 8)).toBe(true);
  });
  it('đạt khi vượt quota', () => {
    expect(isShowroomQuotaReached(9, 8)).toBe(true);
  });
  it('quota 0 = chặn mọi tạo mới', () => {
    expect(isShowroomQuotaReached(0, 0)).toBe(true);
  });
});

describe('disallowedBrandIds', () => {
  it('trả mảng rỗng khi tất cả brand nằm trong whitelist', () => {
    expect(disallowedBrandIds(['a', 'b'], ['a', 'b', 'c'])).toEqual([]);
  });
  it('trả các brand ngoài whitelist', () => {
    expect(disallowedBrandIds(['a', 'x'], ['a', 'b'])).toEqual(['x']);
  });
  it('whitelist rỗng = mọi brand đều bị từ chối', () => {
    expect(disallowedBrandIds(['a'], [])).toEqual(['a']);
  });
  it('yêu cầu rỗng = không có gì bị từ chối', () => {
    expect(disallowedBrandIds([], ['a'])).toEqual([]);
  });
});
