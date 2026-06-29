// app/src/lib/b10.ts
import { type LeadStatus } from './lead-status';
import { normalizePhone } from './phone';

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

export interface B10Row { phone: string; status: string | null }
export interface B10Lead { id: string; phone: string; b10_status: LeadStatus | null }
export interface B10Update { id: string; b10_status: LeadStatus | null }
export interface B10Summary {
  totalRows: number;
  matched: number;     // số dòng khớp lead trong phạm vi & đã cập nhật
  notFound: number;    // SĐT không có lead nào trong công ty (hoặc thiếu SĐT)
  outOfScope: number;  // SĐT có lead trong công ty nhưng ngoài phạm vi người import
  unrecognized: string[]; // giá trị kết quả lạ (distinct)
}
export interface B10Result { updates: B10Update[]; summary: B10Summary }

/**
 * Đối soát thuần (không IO):
 * - `scopedLeads`: lead người import được phép sửa (đã RLS-scope), khớp theo SĐT chuẩn hoá `+84…`.
 * - `companyPhones`: tập SĐT chuẩn hoá `+84…` của toàn công ty — để phân biệt "ngoài phạm vi" vs "không tìm thấy".
 * SĐT chuẩn hoá qua `normalizePhone` của app (cùng khoá định danh `+84…` mà lead lưu trong DB).
 */
export function reconcileB10(
  rows: B10Row[],
  scopedLeads: B10Lead[],
  companyPhones: Set<string>,
): B10Result {
  const byPhone = new Map<string, B10Lead>();
  for (const l of scopedLeads) {
    const k = normalizePhone(l.phone);
    if (k) byPhone.set(k, l);
  }

  // Gộp best theo lead id (nhiều dòng có thể trỏ cùng 1 khách).
  const merged = new Map<string, LeadStatus | null>(); // id → best b10_status mới
  const unrecognized = new Set<string>();
  let matched = 0, notFound = 0, outOfScope = 0;

  for (const row of rows) {
    const p = normalizePhone(row.phone);
    if (!p) { notFound += 1; continue; }
    const lead = byPhone.get(p);
    if (!lead) {
      if (companyPhones.has(p)) outOfScope += 1; else notFound += 1;
      continue;
    }
    const code = normalizeB10Status(row.status);
    if (row.status && row.status.trim() && code === null) unrecognized.add(row.status.trim());
    const current = merged.has(lead.id) ? merged.get(lead.id)! : lead.b10_status;
    merged.set(lead.id, bestB10Status(current, code));
    matched += 1;
  }

  const updates: B10Update[] = [...merged.entries()].map(([id, b10_status]) => ({ id, b10_status }));
  return {
    updates,
    summary: { totalRows: rows.length, matched, notFound, outOfScope, unrecognized: [...unrecognized] },
  };
}
