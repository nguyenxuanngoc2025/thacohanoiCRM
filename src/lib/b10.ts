// app/src/lib/b10.ts
import { type LeadStatus } from './lead-status';

/** Thang xếp hạng B10 (thấp → cao). NULL = chưa phân loại (thấp nhất). */
export const B10_RANK: Record<LeadStatus, number> = {
  'Chưa LH được': 1,
  Fail: 2,
  KHQT: 3,
  GDTD: 4,
  'KHĐ': 5,
};

const rankOf = (s: LeadStatus | null): number => (s ? B10_RANK[s] : 0);

/** Lấy trạng thái B10 tốt nhất giữa 2 giá trị — không bao giờ tụt hạng. */
export function bestB10Status(a: LeadStatus | null, b: LeadStatus | null): LeadStatus | null {
  return rankOf(b) > rankOf(a) ? b : a;
}

/** Chuẩn hoá giá trị kết quả từ file về mã chuẩn; rỗng/lạ → null. */
export function normalizeB10Status(raw: string | null): LeadStatus | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const map: Record<string, LeadStatus> = {
    khqt: 'KHQT',
    gdtd: 'GDTD',
    'khđ': 'KHĐ',
    'chưa lh được': 'Chưa LH được',
    fail: 'Fail',
  };
  return map[v] ?? null;
}
