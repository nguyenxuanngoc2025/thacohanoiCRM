// Hàm thuần render nội dung tin Zalo. KHÔNG emoji (preference user).
// zca-bot chỉ gửi payload.text — mọi logic nội dung nằm ở đây.

export interface NewLeadInput {
  showroom: string;
  fullName: string | null;
  phone: string;
  source: string | null;
  model: string | null;
  assignee: string | null;
}

export function renderNewLead(i: NewLeadInput): string {
  const ten = i.fullName?.trim() || 'Khách lẻ';
  const nguon = i.source?.trim() || 'không rõ';
  const xe = i.model?.trim();
  const tvbh = i.assignee?.trim() || 'chưa phân';
  return [
    `LEAD MỚI — ${i.showroom}`,
    `KH: ${ten} · ${i.phone}`,
    xe ? `Nguồn: ${nguon} · Xe: ${xe}` : `Nguồn: ${nguon}`,
    `Giao cho: ${tvbh}`,
  ].join('\n');
}

export interface OverdueItem {
  fullName: string | null;
  phone: string;
  assignee: string | null;
  overdueHours: number;
}

export function renderOverdue(showroom: string, items: OverdueItem[]): string {
  const head = `QUÁ HẠN LIÊN HỆ — ${showroom} (${items.length} lead)`;
  const lines = items.map((it) => {
    const ten = it.fullName?.trim() || 'Khách lẻ';
    const tvbh = it.assignee?.trim() || 'chưa phân';
    return `• ${ten} ${it.phone} — ${tvbh} — quá hạn ${it.overdueHours}h`;
  });
  return [head, ...lines].join('\n');
}

export interface DailySrStats {
  total: number;
  contacted: number;
  pending: number;
  overdue: number;
  KHQT: number;
  GDTD: number;
  KyHD: number;  // status 'KHĐ' = Ký hợp đồng
  Fail: number;
}

export function renderDailySr(showroom: string, dateLabel: string, s: DailySrStats): string {
  return [
    `BÁO CÁO NGÀY ${dateLabel} — ${showroom}`,
    `Lead mới: ${s.total} · Đã LH: ${s.contacted} · Chưa: ${s.pending} · Quá hạn: ${s.overdue}`,
    `Phân loại: KHQT ${s.KHQT} · GDTD ${s.GDTD} · Ký HĐ ${s.KyHD} · Loại ${s.Fail}`,
  ].join('\n');
}

export interface MgmtRow {
  showroom: string;
  total: number;
  contacted: number;
  pending: number;
  overdue: number;
  contactRate: number; // %
}

export function renderDailyMgmt(dateLabel: string, rows: MgmtRow[]): string {
  const head = `BÁO CÁO NGÀY ${dateLabel} — TỔNG HỢP BLĐ`;
  const sorted = [...rows].sort((a, b) => b.contactRate - a.contactRate);
  const body = sorted.map((r) => {
    const flag = r.overdue >= 3 || r.contactRate < 50 ? ' [cần chú ý]' : '';
    return `${r.showroom}: mới ${r.total} · LH ${r.contactRate}% · quá hạn ${r.overdue}${flag}`;
  });
  return [head, ...body].join('\n');
}
