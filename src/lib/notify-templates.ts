// Hàm thuần render nội dung tin Zalo. KHÔNG emoji (preference user).
// zca-bot chỉ gửi payload.text — mọi logic nội dung nằm ở đây.

import { formatPhoneDisplay } from './phone';

// Che 3 số cuối SĐT khi gửi vào nhóm chung: chống TVBH xem trọn SĐT KH của TVBH khác.
// TVBH phụ trách vẫn xem SĐT đầy đủ trong app (lead của mình).
// Luôn hiển thị dạng 10 chữ số (0xxxxxxxxx), KHÔNG dùng +84.
export function maskPhone(phone: string): string {
  const p = formatPhoneDisplay(phone).trim();
  if (p.length <= 3) return '***';
  return p.slice(0, -3) + '***';
}

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
  const tvbh = i.assignee?.trim() || 'Chưa được phân giao';
  return [
    `LEAD MỚI — ${i.showroom}`,
    `KH: ${ten} · ${maskPhone(i.phone)}`,
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

// Giới hạn số lead liệt kê trong 1 tin: tin quá dài bị Zalo từ chối ("Tham số không hợp lệ").
const OVERDUE_MAX_LINES = 20;

export function renderOverdue(showroom: string, items: OverdueItem[]): string {
  const head = `QUÁ HẠN LIÊN HỆ — ${showroom} (${items.length} lead)`;
  const shown = items.slice(0, OVERDUE_MAX_LINES);
  const lines = shown.map((it) => {
    const ten = it.fullName?.trim() || 'Khách lẻ';
    const tvbh = it.assignee?.trim() || 'Chưa được phân giao';
    return `• ${ten} ${maskPhone(it.phone)} — ${tvbh} — quá hạn ${it.overdueHours}h`;
  });
  const remaining = items.length - shown.length;
  if (remaining > 0) lines.push(`… và ${remaining} lead khác — xem chi tiết trên hệ thống.`);
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

export const pct = (part: number, total: number): number =>
  total > 0 ? Math.round((part / total) * 100) : 0;

export interface NonCompliant {
  name: string;       // tên TVBH, hoặc 'Chưa phân'
  overdue: number;    // số lead quá hạn của người này
}

// Dòng "Chưa tuân thủ": top 3 TVBH có lead quá hạn nhiều nhất, dư thì "…+N nữa".
function renderNonCompliant(list: NonCompliant[]): string {
  if (list.length === 0) return 'Chưa tuân thủ: không có';
  const top = list.slice(0, 3).map((x, idx) =>
    idx === 0 ? `${x.name} (${x.overdue} lead quá hạn)` : `${x.name} (${x.overdue})`);
  const extra = list.length > 3 ? `…+${list.length - 3} nữa` : '';
  return `Chưa tuân thủ: ${[...top, extra].filter(Boolean).join(', ')}`;
}

export function renderDailySr(showroom: string, dateLabel: string, s: DailySrStats, nonCompliant: NonCompliant[]): string {
  return [
    `BÁO CÁO NGÀY ${dateLabel} — ${showroom}`,
    `Tổng lead: ${s.total} · Đã LH: ${s.contacted} (${pct(s.contacted, s.total)}%) · Chưa LH: ${s.pending} · Quá hạn: ${s.overdue}`,
    `Phân loại: KHQT ${s.KHQT} · GDTD ${s.GDTD} · Ký HĐ ${s.KyHD} · Loại ${s.Fail}`,
    renderNonCompliant(nonCompliant),
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

export interface MgmtTotals {
  total: number;
  contacted: number;
  overdue: number;
}

export function renderDailyMgmt(dateLabel: string, rows: MgmtRow[], totals: MgmtTotals): string {
  const head = `BÁO CÁO NGÀY ${dateLabel} — TỔNG HỢP BLĐ`;
  const totalLine = `TỔNG: ${totals.total} lead · Đã LH ${totals.contacted} (${pct(totals.contacted, totals.total)}%) · Quá hạn ${totals.overdue}`;
  const sorted = [...rows].sort((a, b) => b.contactRate - a.contactRate);
  const body = sorted.map((r) => {
    const flag = r.overdue >= 3 || r.contactRate < 50 ? ' [cần chú ý]' : '';
    return `${r.showroom}: mới ${r.total} · LH ${r.contactRate}% · quá hạn ${r.overdue}${flag}`;
  });
  return [head, totalLine, '———', ...body].join('\n');
}
