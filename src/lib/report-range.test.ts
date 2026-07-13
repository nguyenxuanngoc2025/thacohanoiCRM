import { describe, it, expect } from 'vitest';
import { resolveRange, isRangeKey } from './report-range';

const DAY = 86400000;
const VN = 7 * 3600000;
const now = Date.parse('2026-07-13T09:00:00Z'); // 16:00 giờ VN, 13/07

describe('resolveRange', () => {
  it('this_month (mặc định) → từ ngày 1 tới now', () => {
    expect(resolveRange('this_month', now)).toEqual({ fromMs: Date.UTC(2026, 6, 1), toMs: now });
  });
  it('range lạ rơi về this_month', () => {
    // @ts-expect-error test giá trị ngoài union
    expect(resolveRange('bogus', now)).toEqual({ fromMs: Date.UTC(2026, 6, 1), toMs: now });
  });
  it('last_month → trọn tháng trước', () => {
    expect(resolveRange('last_month', now)).toEqual({ fromMs: Date.UTC(2026, 5, 1), toMs: Date.UTC(2026, 6, 1) - 1 });
  });
  it('30d → 30 ngày gần nhất (UTC)', () => {
    expect(resolveRange('30d', now)).toEqual({ fromMs: Date.UTC(2026, 6, 13) - 29 * DAY, toMs: now });
  });
  it('today → 00:00 hôm nay giờ VN', () => {
    expect(resolveRange('today', now)).toEqual({ fromMs: Date.UTC(2026, 6, 13) - VN, toMs: now });
  });
  it('today tính theo VN, không theo UTC (rạng sáng VN = tối hôm trước UTC)', () => {
    const n = Date.parse('2026-07-12T20:00:00Z'); // 03:00 giờ VN 13/07 (UTC vẫn 12/07)
    // Mốc phải là 00:00 VN 13/07 = 17:00 UTC 12/07, KHÔNG phải 00:00 UTC 12/07.
    expect(resolveRange('today', n).fromMs).toBe(Date.parse('2026-07-12T17:00:00Z'));
  });
  it('this_week → bắt đầu Thứ 2 giờ VN, ≤ đầu hôm nay', () => {
    const r = resolveRange('this_week', now);
    const startVN = new Date(r.fromMs + VN);
    expect(startVN.getUTCDay()).toBe(1); // Thứ 2
    const todayStart = Date.UTC(2026, 6, 13) - VN;
    expect(r.fromMs).toBeLessThanOrEqual(todayStart);
    expect((todayStart - r.fromMs) % DAY).toBe(0);
    expect(todayStart - r.fromMs).toBeLessThan(7 * DAY);
    expect(r.toMs).toBe(now);
  });
  it('custom hợp lệ → đúng from/to', () => {
    expect(resolveRange('custom', now, '2026-07-01', '2026-07-05')).toEqual({
      fromMs: Date.parse('2026-07-01T00:00:00Z'), toMs: Date.parse('2026-07-05T23:59:59Z'),
    });
  });
  it('custom sai (from > to) rơi về this_month', () => {
    expect(resolveRange('custom', now, '2026-07-10', '2026-07-01')).toEqual({ fromMs: Date.UTC(2026, 6, 1), toMs: now });
  });
});

describe('isRangeKey', () => {
  it('nhận key hợp lệ, loại key lạ/rỗng', () => {
    expect(isRangeKey('today')).toBe(true);
    expect(isRangeKey('this_week')).toBe(true);
    expect(isRangeKey('bogus')).toBe(false);
    expect(isRangeKey(undefined)).toBe(false);
  });
});
