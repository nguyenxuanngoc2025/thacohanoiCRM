import { describe, it, expect } from 'vitest';
import { isLeadOverdue } from './overdue';

const NOW = Date.parse('2026-06-25T00:00:00Z');
const PAST = '2026-06-20T00:00:00Z';
const FUTURE = '2026-06-30T00:00:00Z';

describe('isLeadOverdue', () => {
  it('đã giao + chưa chuyển trạng thái + quá hạn SLA → quá hạn', () => {
    expect(isLeadOverdue({ assigned_to: 'u1', status: null, next_contact_at: PAST }, NOW)).toBe(true);
  });

  it('chưa giao (assigned_to null) → không tính, dù quá hạn', () => {
    expect(isLeadOverdue({ assigned_to: null, status: null, next_contact_at: PAST }, NOW)).toBe(false);
  });

  it('đã chuyển trạng thái (KHQT/GDTD/KHĐ/Fail) → thoát quá hạn', () => {
    expect(isLeadOverdue({ assigned_to: 'u1', status: 'KHQT', next_contact_at: PAST }, NOW)).toBe(false);
    expect(isLeadOverdue({ assigned_to: 'u1', status: 'GDTD', next_contact_at: PAST }, NOW)).toBe(false);
    expect(isLeadOverdue({ assigned_to: 'u1', status: 'KHĐ', next_contact_at: PAST }, NOW)).toBe(false);
    expect(isLeadOverdue({ assigned_to: 'u1', status: 'Fail', next_contact_at: PAST }, NOW)).toBe(false);
  });

  it('chưa tới hạn SLA → không quá hạn', () => {
    expect(isLeadOverdue({ assigned_to: 'u1', status: null, next_contact_at: FUTURE }, NOW)).toBe(false);
  });

  it('chưa có hạn SLA (next_contact_at null) → không quá hạn', () => {
    expect(isLeadOverdue({ assigned_to: 'u1', status: null, next_contact_at: null }, NOW)).toBe(false);
  });
});
