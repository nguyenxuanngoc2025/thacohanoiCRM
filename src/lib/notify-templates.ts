// Hàm thuần render nội dung tin Zalo. KHÔNG emoji (preference user).
// zca-bot chỉ gửi payload.text — mọi logic nội dung nằm ở đây.
// Định dạng: bọc <b>...</b> = chữ ĐẬM, <i>...</i> = chữ NGHIÊNG; zca-bot đổi tag này
// thành style của Zalo (offset tính trên text cuối, sau khi bù tên). Tag chỉ phục vụ tin Zalo,
// không hiện trên app. Dùng tag <b>/<i> (không phải **...**) để KHÔNG đụng dấu * trong SĐT che (***).

import { formatPhoneDisplay } from './phone';
import { sourcePlatform, sourceLabel } from './source';

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
  // Nguồn data thật (Facebook/Google/TikTok…) — Google Sheet chỉ là kênh trung chuyển,
  // nguồn đã được gán khi cấu hình sheet nên hiển thị đúng nền tảng gốc.
  // Kèm chi tiết kênh nếu có (Lead Ads / Tin nhắn / Bình luận…) để biết lead đến từ đâu.
  const platform = sourcePlatform(i.source);
  const detail = sourceLabel(i.source);
  const nguon = detail !== '—' ? `${platform} · ${detail}` : platform;
  // Luôn hiển thị dòng xe; chưa dò ra thì ghi rõ "chưa xác định".
  const xe = i.model?.trim() || 'chưa xác định';
  const tinhTrang = i.assignee?.trim() ? `Đã giao cho ${i.assignee.trim()}` : 'Chưa được phân giao';
  return [
    `<b>LEAD MỚI — ${i.showroom}</b>`,
    `<i>Digital Platform · Lead trực tuyến</i>`,
    `KH: <b>${ten}</b> · ${maskPhone(i.phone)}`,
    `Nguồn: ${nguon}`,
    `Dòng xe quan tâm: ${xe}`,
    `Tình trạng: <b>${tinhTrang}</b>`,
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
