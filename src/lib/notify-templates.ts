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
  // Khách cũ đã có trên B10 (đối soát trước đó): có = thêm dòng cảnh báo để làm căn cứ phân giao.
  b10Prior?: { status: string | null; note: string | null } | null;
}

// Cắt bớt nội dung chăm sóc B10 khi quá dài để tin Zalo không bị từ chối.
const B10_NOTE_CAP = 300;

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
  const assigned = !!i.assignee?.trim();
  // Chưa có TVBH → nhấn mạnh IN HOA để quản lý thấy ngay cần phân giao gấp.
  const tinhTrang = assigned ? `Đã giao cho ${i.assignee!.trim()}` : 'CHƯA ĐƯỢC PHÂN GIAO';
  const lines = [
    `<b>LEAD MỚI — ${i.showroom}</b>`,
    `KH: <b>${ten}</b> · ${maskPhone(i.phone)}`,
    `Nguồn: ${nguon}`,
    `Dòng xe quan tâm: ${xe}`,
    `Tình trạng: <b>${tinhTrang}</b>`,
  ];
  // Lời nhắc hành động khi lead chưa có người phụ trách.
  if (!assigned) lines.push('<i>Vào hệ thống phân giao cho TVBH.</i>');
  // Khách cũ đã có trên B10 → cảnh báo rõ để TVBH/quản lý có căn cứ phân giao.
  if (i.b10Prior) {
    const st = i.b10Prior.status?.trim();
    lines.push(`<b>KHÁCH CŨ — đã có trên B10${st ? ` (${st})` : ''}</b>`);
    const note = i.b10Prior.note?.trim();
    if (note) {
      const short = note.length > B10_NOTE_CAP ? note.slice(0, B10_NOTE_CAP) + '…' : note;
      lines.push(`Nội dung B10: <i>${short}</i>`);
    }
  }
  return lines.join('\n');
}

export interface LeadAssignedInput {
  showroom: string;
  fullName: string | null;
  phone: string;
  model: string | null;
  assignee: string;
}

// Tin "đã phân giao" — bắn vào nhóm phòng khi lead được giao cho 1 TVBH, nhắc vào chăm sóc.
export function renderLeadAssigned(i: LeadAssignedInput): string {
  const ten = i.fullName?.trim() || 'Khách lẻ';
  const xe = i.model?.trim() || 'chưa xác định';
  return [
    `<b>PHÂN GIAO — ${i.showroom}</b>`,
    `KH: <b>${ten}</b> · ${maskPhone(i.phone)}`,
    `Dòng xe quan tâm: ${xe}`,
    `Giao cho: <b>${i.assignee}</b>`,
    '<b>Yêu cầu vào chăm sóc ngay.</b>',
  ].join('\n');
}

export interface AssignedCount {
  name: string;   // tên TVBH
  count: number;  // số lead vừa giao cho người này
}

// Tin tóm tắt phân giao hàng loạt (bulkReassign / autoDistribute) — 1 tin/phòng, chống dội nhóm.
export function renderLeadsAssignedSummary(showroom: string, total: number, perAssignee: AssignedCount[]): string {
  const rows = perAssignee.map((a) => `• ${a.name} — ${a.count} lead`);
  return [
    `<b>PHÂN GIAO — ${showroom}</b>`,
    `<b>${total}</b> lead vừa được giao:`,
    ...rows,
    '<b>Yêu cầu các TVBH vào chăm sóc ngay.</b>',
  ].join('\n');
}

export interface OverdueItem {
  fullName: string | null;
  phone: string;
  assignee: string | null;
  overdueHours: number;
}

// Chỉ nêu vài lead gấp nhất; phần còn lại gói gọn vào số liệu — tin ngắn, dễ đọc,
// không bị Zalo từ chối vì quá dài, và đủ thông điệp để nhóm hành động ngay.
const OVERDUE_TOP = 3;

export function renderOverdue(showroom: string, items: OverdueItem[]): string {
  const total = items.length;
  const unassigned = items.filter((it) => !it.assignee?.trim()).length;
  const assigned = total - unassigned;
  const maxOverdue = items.reduce((m, it) => Math.max(m, it.overdueHours), 0);

  // Top lead gấp nhất (quá hạn lâu nhất) để nêu đích danh, còn lại quy về số liệu.
  const top = [...items]
    .sort((a, b) => b.overdueHours - a.overdueHours)
    .slice(0, OVERDUE_TOP)
    .map((it) => {
      const ten = it.fullName?.trim() || 'Khách lẻ';
      const tvbh = it.assignee?.trim() || 'chưa phân giao';
      return `• ${ten} ${maskPhone(it.phone)} — ${tvbh} — ${it.overdueHours}h`;
    });
  const remaining = total - top.length;

  const lines = [
    `<b>QUÁ HẠN LIÊN HỆ — ${showroom}</b>`,
    `Tổng <b>${total}</b> lead · Chưa phân giao ${unassigned} · Đã giao ${assigned}`,
    `Quá hạn lâu nhất: ${maxOverdue}h`,
    '',
    'Ưu tiên xử lý:',
    ...top,
  ];
  if (remaining > 0) lines.push(`… và ${remaining} lead khác.`);
  lines.push('Vào hệ thống để phân giao và liên hệ ngay.');
  return lines.join('\n');
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

// dateLabel đã gồm từ chỉ kỳ: 'NGÀY 24/06' | 'TUẦN 23/06–29/06' | 'THÁNG 06/2026'.
export function renderDailySr(showroom: string, dateLabel: string, s: DailySrStats, nonCompliant: NonCompliant[]): string {
  return [
    `BÁO CÁO ${dateLabel} — ${showroom}`,
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
  const head = `BÁO CÁO ${dateLabel} — TỔNG HỢP BLĐ`;
  const totalLine = `TỔNG: ${totals.total} lead · Đã LH ${totals.contacted} (${pct(totals.contacted, totals.total)}%) · Quá hạn ${totals.overdue}`;
  const sorted = [...rows].sort((a, b) => b.contactRate - a.contactRate);
  const body = sorted.map((r) => {
    const flag = r.overdue >= 3 || r.contactRate < 50 ? ' [cần chú ý]' : '';
    return `${r.showroom}: mới ${r.total} · LH ${r.contactRate}% · quá hạn ${r.overdue}${flag}`;
  });
  return [head, totalLine, '———', ...body].join('\n');
}
