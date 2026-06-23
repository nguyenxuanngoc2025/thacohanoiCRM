import { describe, it, expect } from 'vitest';
import { STATUS_OPTIONS, isContacted, STATUS_LABEL } from './lead-status';

describe('lead-status', () => {
  it('có đúng 5 phân loại theo CHECK DB', () => {
    expect(STATUS_OPTIONS.map((s) => s.code)).toEqual([
      'KHQT', 'GDTD', 'KHĐ', 'Chưa LH được', 'Fail',
    ]);
  });

  it('nhãn nội bộ đúng cho KHĐ và GDTD', () => {
    expect(STATUS_LABEL['KHĐ']).toBe('Ký hợp đồng');
    expect(STATUS_LABEL['GDTD']).toBe('Giao dịch theo dõi');
  });

  it('isContacted theo last_contact_at', () => {
    expect(isContacted(null)).toBe(false);
    expect(isContacted('2026-06-23T03:00:00Z')).toBe(true);
  });
});
