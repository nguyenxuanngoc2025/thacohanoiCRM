import { describe, it, expect } from 'vitest';
import { decideOverdueAction } from './overdue-escalation';

describe('decideOverdueAction', () => {
  const now = new Date('2026-06-27T10:00:00Z');
  it('count=0 và đã quá hạn → nhắc (lần 1), nextCount=1', () => {
    expect(decideOverdueAction({ count: 0, nextContactAt: '2026-06-27T09:00:00Z', lastNotifiedAt: null, gapHours: 2 }, now))
      .toEqual({ notify: true, nextCount: 1 });
  });
  it('count=0 nhưng CHƯA tới hạn → không nhắc', () => {
    expect(decideOverdueAction({ count: 0, nextContactAt: '2026-06-27T11:00:00Z', lastNotifiedAt: null, gapHours: 2 }, now).notify).toBe(false);
  });
  it('count=1 và đã đủ gap kể từ lần nhắc trước → nhắc (lần 2), nextCount=2', () => {
    expect(decideOverdueAction({ count: 1, nextContactAt: '2026-06-27T06:00:00Z', lastNotifiedAt: '2026-06-27T07:00:00Z', gapHours: 2 }, now))
      .toEqual({ notify: true, nextCount: 2 });
  });
  it('count=1 nhưng CHƯA đủ gap → không nhắc', () => {
    expect(decideOverdueAction({ count: 1, nextContactAt: '2026-06-27T06:00:00Z', lastNotifiedAt: '2026-06-27T09:00:00Z', gapHours: 2 }, now).notify).toBe(false);
  });
  it('count>=2 → không bao giờ nhắc nữa', () => {
    expect(decideOverdueAction({ count: 2, nextContactAt: '2026-06-27T01:00:00Z', lastNotifiedAt: '2026-06-27T05:00:00Z', gapHours: 2 }, now).notify).toBe(false);
  });
});
