// Định nghĩa DUY NHẤT cho "lead quá hạn" — dùng chung cho bảng /leads, báo cáo KPI và cron nhắc.
// Quy trình đã chốt với người dùng: quá hạn chỉ tính khi lead ĐÃ giao cho TVBH mà TVBH
// CHƯA chuyển trạng thái, và đã quá hạn liên hệ theo SLA. Đã chuyển trạng thái → thoát ngay.

export interface OverdueLike {
  assigned_to: string | null;   // chưa giao (null) → không tính hạn cho TVBH
  status: string | null;        // đã chuyển trạng thái (khác null) → không còn quá hạn
  next_contact_at: string | null; // hạn SLA (đặt từ lúc giao); trống → chưa có hạn
}

/** Lead quá hạn liên hệ: đã giao TVBH, chưa chuyển trạng thái, và hạn SLA đã trôi qua. */
export function isLeadOverdue(l: OverdueLike, nowMs: number): boolean {
  if (!l.assigned_to) return false;
  if (l.status !== null) return false;
  if (!l.next_contact_at) return false;
  return new Date(l.next_contact_at).getTime() < nowMs;
}
