// Quy đổi bộ chọn thời gian của trang Báo cáo → [fromMs, toMs]. Hàm thuần (test được).
// Hôm nay / Tuần này tính theo GIỜ VIỆT NAM (UTC+7). Các mục cũ giữ nguyên cách tính (UTC) để không xáo số liệu.

export type RangeKey = 'today' | 'this_week' | 'this_month' | 'last_month' | '30d' | 'custom';

export const RANGE_KEYS: RangeKey[] = ['today', 'this_week', 'this_month', 'last_month', '30d', 'custom'];

export function isRangeKey(v: string | undefined | null): v is RangeKey {
  return !!v && (RANGE_KEYS as string[]).includes(v);
}

const DAY = 86400000;
const VN = 7 * 3600000; // offset múi giờ Việt Nam

export function resolveRange(range: RangeKey, now: number, from?: string, to?: string): { fromMs: number; toMs: number } {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();

  // Mốc 00:00 hôm nay theo giờ VN, quy về UTC ms.
  const vn = new Date(now + VN);
  const vnTodayStart = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN;

  if (range === 'today') {
    return { fromMs: vnTodayStart, toMs: now };
  }
  if (range === 'this_week') {
    const sinceMon = (vn.getUTCDay() + 6) % 7; // Thứ 2 = 0
    return { fromMs: vnTodayStart - sinceMon * DAY, toMs: now };
  }
  if (range === 'last_month') {
    return { fromMs: Date.UTC(y, m - 1, 1), toMs: Date.UTC(y, m, 1) - 1 };
  }
  if (range === '30d') {
    return { fromMs: Date.UTC(y, m, d.getUTCDate()) - 29 * DAY, toMs: now };
  }
  if (range === 'custom' && from && to) {
    const f = Date.parse(`${from}T00:00:00Z`);
    const t = Date.parse(`${to}T23:59:59Z`);
    if (!Number.isNaN(f) && !Number.isNaN(t) && f <= t) return { fromMs: f, toMs: t };
  }
  // this_month (mặc định)
  return { fromMs: Date.UTC(y, m, 1), toMs: now };
}
