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

/**
 * Chuẩn hoá giá trị kết quả từ file B10 về mã chuẩn của ta; rỗng/lạ → null.
 * Nhận cả mã nội bộ (KHQT/GDTD/…) LẪN trạng thái DDMS Sales Funnel tiếng Anh
 * xuất từ B10 (cột "Trạng thái cuối"), ánh xạ theo TB 85/2025/TB-THACO AUTO KM HN:
 *   - Contact  (Khách hàng liên hệ)          → KHQT
 *   - Prospect (Khách hàng quan tâm)         → KHQT
 *   - Appointment / Test drive / Sales offer / Booking (Giao dịch theo dõi) → GDTD
 *   - Fail                                    → Fail
 * "KHĐ" (Ký hợp đồng) KHÔNG đến từ funnel — chỉ set qua luồng hợp đồng riêng,
 * nên trạng thái tối đa suy từ file B10 là GDTD.
 */
export function normalizeB10Status(raw: string | null): LeadStatus | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!v) return null;
  const map: Record<string, LeadStatus> = {
    // Mã nội bộ
    khqt: 'KHQT',
    gdtd: 'GDTD',
    'khđ': 'KHĐ',
    'chưa lh được': 'Chưa LH được',
    fail: 'Fail',
    // Trạng thái DDMS Sales Funnel → định nghĩa của ta
    contact: 'KHQT',
    prospect: 'KHQT',
    appointment: 'GDTD',
    'test drive': 'GDTD',
    testdrive: 'GDTD',
    'sales offer': 'GDTD',
    salesoffer: 'GDTD',
    booking: 'GDTD',
  };
  // Thử khớp trực tiếp, rồi thử bỏ hết khoảng trắng (vd "salesoffer").
  return map[v] ?? map[v.replace(/\s+/g, '')] ?? null;
}

export interface B10Row { phone: string; status: string | null; note?: string | null }

/** 1 bản ghi kho B10 (theo SĐT chuẩn hoá +84…), độc lập với lead. */
export interface B10ArchiveRecord { phone: string; b10_status: LeadStatus | null; care_note: string | null }

/**
 * Gom TẤT CẢ dòng file B10 thành bản ghi kho theo SĐT chuẩn hoá `+84…`:
 * - `b10_status`: trạng thái tốt nhất (không tụt hạng) giữa mọi dòng cùng SĐT.
 * - `care_note`: gộp ĐỦ mọi nội dung chăm sóc không rỗng, theo thứ tự file, bỏ trùng.
 * Bỏ qua dòng thiếu SĐT. Khác `reconcileB10`: KHÔNG cần biết lead — lưu toàn bộ để tra cứu sau.
 */
export function aggregateB10Archive(rows: B10Row[]): B10ArchiveRecord[] {
  const status = new Map<string, LeadStatus | null>();
  const notes = new Map<string, string[]>();
  for (const row of rows) {
    const p = normalizePhone(row.phone);
    if (!p) continue;
    const code = normalizeB10Status(row.status);
    const cur = status.has(p) ? status.get(p)! : null;
    status.set(p, bestB10Status(cur, code));
    const note = (row.note ?? '').trim();
    if (note) {
      const arr = notes.get(p) ?? [];
      if (!arr.includes(note)) arr.push(note);
      notes.set(p, arr);
    }
  }
  return [...status.keys()].map((phone) => {
    const arr = notes.get(phone);
    return { phone, b10_status: status.get(phone) ?? null, care_note: arr && arr.length ? arr.join('\n') : null };
  });
}
// status = trạng thái chính TVBH đặt trong app (để quyết định có tự nâng hay không).
export interface B10Lead { id: string; phone: string; b10_status: LeadStatus | null; status: LeadStatus | null }
// b10_care_note: null = không có nội dung mới để ghi (giữ nguyên giá trị cũ trong DB).
// new_status: null = KHÔNG đổi trạng thái chính; có giá trị = nâng trạng thái chính lên mức này.
export interface B10Update { id: string; b10_status: LeadStatus | null; b10_care_note: string | null; new_status: LeadStatus | null }
export interface B10Summary {
  totalRows: number;
  matched: number;     // số dòng khớp lead trong phạm vi & đã cập nhật
  notFound: number;    // SĐT không có lead nào trong công ty (hoặc thiếu SĐT)
  outOfScope: number;  // SĐT có lead trong công ty nhưng ngoài phạm vi người import
  unrecognized: string[]; // giá trị kết quả lạ (distinct)
  statusRaised: number; // số lead được tự nâng trạng thái chính (do TVBH chưa phân loại)
  conflicts: number;    // số lead B10 cao hơn nhưng TVBH đã phân loại → chỉ báo, KHÔNG tự sửa
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
  const leadById = new Map<string, B10Lead>();         // id → lead (để đọc trạng thái chính hiện tại)
  const notes = new Map<string, string[]>();           // id → TẤT CẢ nội dung chăm sóc (mỗi dòng file 1 mục, giữ đủ)
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
    leadById.set(lead.id, lead);
    const code = normalizeB10Status(row.status);
    if (row.status && row.status.trim() && code === null) unrecognized.add(row.status.trim());
    const current = merged.has(lead.id) ? merged.get(lead.id)! : lead.b10_status;
    merged.set(lead.id, bestB10Status(current, code));
    // Nội dung chăm sóc: gộp ĐỦ mọi dòng không rỗng của khách này (nhiều dòng đàm phán),
    // theo thứ tự file, bỏ trùng lặp — không chỉ giữ dòng cuối.
    const note = (row.note ?? '').trim();
    if (note) {
      const arr = notes.get(lead.id) ?? [];
      if (!arr.includes(note)) arr.push(note);
      notes.set(lead.id, arr);
    }
    matched += 1;
  }

  // Phương án A: chỉ TỰ nâng trạng thái chính khi TVBH CHƯA phân loại (đang trống
  // hoặc "Chưa LH được"). Nếu TVBH đã phân loại mà B10 cao hơn → coi là điểm lệch,
  // CHỈ đếm để báo, KHÔNG tự sửa (không lật quyết định của con người, vd Fail/KHĐ).
  let statusRaised = 0, conflicts = 0;
  const updates: B10Update[] = [...merged.entries()].map(([id, b10_status]) => {
    const lead = leadById.get(id)!;
    const cur = lead.status;
    const editable = cur == null || cur === 'Chưa LH được';
    let new_status: LeadStatus | null = null;
    if (editable) {
      const raised = bestB10Status(cur, b10_status); // không bao giờ tụt hạng
      if (raised !== cur) { new_status = raised; statusRaised += 1; }
    } else if (b10_status && B10_RANK[b10_status] > B10_RANK[cur]) {
      conflicts += 1;
    }
    const noteArr = notes.get(id);
    return { id, b10_status, b10_care_note: noteArr && noteArr.length ? noteArr.join('\n') : null, new_status };
  });
  return {
    updates,
    summary: {
      totalRows: rows.length, matched, notFound, outOfScope,
      unrecognized: [...unrecognized], statusRaised, conflicts,
    },
  };
}
