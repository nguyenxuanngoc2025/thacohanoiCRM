import { describe, it, expect } from 'vitest';
import { decideOverdueAction, decideCallbackReminder, decideUnassignedReminder, MAX_NO_ANSWER } from './overdue-escalation';

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

describe('decideCallbackReminder', () => {
  const now = new Date('2026-06-27T10:00:00Z');
  it('chưa từng nhắc, đã tới nextContactAt → nhắc', () => {
    expect(decideCallbackReminder({ noAnswerCount: 1, nextContactAt: '2026-06-27T09:00:00Z', lastNotifiedAt: null, gapHours: 2 }, now).notify).toBe(true);
  });
  it('chưa từng nhắc, CHƯA tới nextContactAt → không nhắc', () => {
    expect(decideCallbackReminder({ noAnswerCount: 1, nextContactAt: '2026-06-27T11:00:00Z', lastNotifiedAt: null, gapHours: 2 }, now).notify).toBe(false);
  });
  it('đã nhắc trước đó, đủ gap → nhắc lại', () => {
    expect(decideCallbackReminder({ noAnswerCount: 1, nextContactAt: '2026-06-27T05:00:00Z', lastNotifiedAt: '2026-06-27T07:00:00Z', gapHours: 2 }, now).notify).toBe(true);
  });
  it('đã nhắc trước đó, chưa đủ gap → không nhắc', () => {
    expect(decideCallbackReminder({ noAnswerCount: 1, nextContactAt: '2026-06-27T05:00:00Z', lastNotifiedAt: '2026-06-27T09:00:00Z', gapHours: 2 }, now).notify).toBe(false);
  });
  it('đạt ngưỡng gọi hụt tối đa → ngừng nhắc', () => {
    expect(decideCallbackReminder({ noAnswerCount: MAX_NO_ANSWER, nextContactAt: '2026-06-27T01:00:00Z', lastNotifiedAt: null, gapHours: 2 }, now).notify).toBe(false);
  });
  it('nextContactAt null và chưa nhắc → không nhắc', () => {
    expect(decideCallbackReminder({ noAnswerCount: 1, nextContactAt: null, lastNotifiedAt: null, gapHours: 2 }, now).notify).toBe(false);
  });
});

describe('decideUnassignedReminder', () => {
  const now = new Date('2026-07-22T10:00:00Z');
  const base = { thresholdHours: 1, gapHours: 2 };

  it('chưa tới ngưỡng → không nhắc', () => {
    // tạo lúc 09:30, ngưỡng 1h → hạn 10:30 > now
    const r = decideUnassignedReminder(
      { ...base, createdAt: '2026-07-22T09:30:00Z', lastNotifiedAt: null }, now);
    expect(r.notify).toBe(false);
  });

  it('đúng/quá ngưỡng lần đầu → nhắc', () => {
    // tạo lúc 08:00, hạn 09:00 <= now
    const r = decideUnassignedReminder(
      { ...base, createdAt: '2026-07-22T08:00:00Z', lastNotifiedAt: null }, now);
    expect(r.notify).toBe(true);
  });

  it('đã nhắc, chưa đủ gap → không nhắc', () => {
    // nhắc lúc 09:00, gap 2h → 11:00 > now
    const r = decideUnassignedReminder(
      { ...base, createdAt: '2026-07-22T06:00:00Z', lastNotifiedAt: '2026-07-22T09:00:00Z' }, now);
    expect(r.notify).toBe(false);
  });

  it('đã nhắc, đủ gap → nhắc lại', () => {
    // nhắc lúc 07:30, gap 2h → 09:30 <= now
    const r = decideUnassignedReminder(
      { ...base, createdAt: '2026-07-22T06:00:00Z', lastNotifiedAt: '2026-07-22T07:30:00Z' }, now);
    expect(r.notify).toBe(true);
  });
});
