// Hàm thuần render nội dung tin Zalo. KHÔNG emoji (preference user).
// zca-bot chỉ gửi payload.text — mọi logic nội dung nằm ở đây.
// Định dạng: bọc <b>...</b> = chữ ĐẬM, <i>...</i> = chữ NGHIÊNG; zca-bot đổi tag này
// thành style của Zalo (offset tính trên text cuối, sau khi bù tên). Tag chỉ phục vụ tin Zalo,
// không hiện trên app. Dùng tag <b>/<i> (không phải **...**) để KHÔNG đụng dấu * trong SĐT che (***).

import { formatPhoneDisplay } from './phone';
import { sourcePlatform, sourceLabel, type SourceCatalog } from './source';

// Che 3 số cuối SĐT khi gửi vào nhóm chung: chống TVBH xem trọn SĐT KH của TVBH khác.
// TVBH phụ trách vẫn xem SĐT đầy đủ trong app (lead của mình).
// Luôn hiển thị dạng 10 chữ số (0xxxxxxxxx), KHÔNG dùng +84.
export function maskPhone(phone: string): string {
  const p = formatPhoneDisplay(phone).trim();
  if (p.length <= 3) return '***';
  return p.slice(0, -3) + '***';
}

// Nhắc quản lý showroom đặt lịch phòng trực khi hôm nay chưa có phòng nhận (chiến lược day_roster).
export function renderRosterMissing(showroom: string, ddmm: string): string {
  return [
    `<b>NHẮC LỊCH PHÒNG NHẬN — ${showroom}</b>`,
    `Hôm nay (${ddmm}) chưa đặt phòng trực nhận lead. Lead mới đang chờ, <b>CHƯA phân giao</b>.`,
    '<i>Vào Cài đặt → Phân giao để đặt phòng nhận cho hôm nay.</i>',
  ].join('\n');
}

export interface NewLeadInput {
  showroom: string;
  // Tên phòng (do user đặt) → tiêu đề tin. null/rỗng = chưa xác định phòng → fallback showroom.
  team: string | null;
  fullName: string | null;
  phone: string;
  source: string | null;
  model: string | null;
  assignee: string | null;
  // Khách cũ đã có trên B10 (đối soát trước đó): có = thêm dòng cảnh báo để làm căn cứ phân giao.
  b10Prior?: { status: string | null; note: string | null } | null;
  // Danh mục nguồn/kênh từ DB — có thì hiển thị đúng tên kênh tự tạo (vd "Tool"). Không có → fallback builtin.
  catalog?: SourceCatalog;
}

// Cắt bớt nội dung chăm sóc B10 khi quá dài để tin Zalo không bị từ chối.
const B10_NOTE_CAP = 300;

export function renderNewLead(i: NewLeadInput): string {
  const ten = i.fullName?.trim() || 'Khách lẻ';
  // Nguồn data thật (Facebook/Google/TikTok…) — Google Sheet chỉ là kênh trung chuyển,
  // nguồn đã được gán khi cấu hình sheet nên hiển thị đúng nền tảng gốc.
  // Kèm chi tiết kênh nếu có (Lead Ads / Tin nhắn / Bình luận…) để biết lead đến từ đâu.
  const platform = sourcePlatform(i.source, i.catalog);
  const detail = sourceLabel(i.source, i.catalog);
  const nguon = detail !== '—' ? `${platform} · ${detail}` : platform;
  // Luôn hiển thị dòng xe; chưa dò ra thì ghi rõ "chưa xác định".
  const xe = i.model?.trim() || 'chưa xác định';
  const assigned = !!i.assignee?.trim();
  // Chưa có TVBH → nhấn mạnh IN HOA để quản lý thấy ngay cần phân giao gấp.
  const tinhTrang = assigned ? `Đã giao cho ${i.assignee!.trim()}` : 'CHƯA ĐƯỢC PHÂN GIAO';
  // Tiêu đề theo tên phòng (user đặt); chưa xác định phòng → fallback tên showroom.
  const scope = i.team?.trim() || i.showroom;
  const lines = [
    `<b>LEAD MỚI — ${scope}</b>`,
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
  // Tên phòng (do user đặt) → tiêu đề tin. null/rỗng = fallback showroom.
  team: string | null;
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
    `<b>PHÂN GIAO — ${i.team?.trim() || i.showroom}</b>`,
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

export interface CallbackItem {
  fullName: string | null;
  phone: string;
  assignee: string | null;
  noAnswerCount: number; // số lần đã gọi hụt (chưa liên hệ được)
}

// Tin nhắc gọi lại cho lead "Chưa LH được": tinh tế, nhấn số lần đã gọi hụt để TVBH kiên trì.
export function renderCallbackReminder(showroom: string, items: CallbackItem[]): string {
  const total = items.length;
  const top = [...items]
    .sort((a, b) => b.noAnswerCount - a.noAnswerCount)
    .slice(0, OVERDUE_TOP)
    .map((it) => {
      const ten = it.fullName?.trim() || 'Khách lẻ';
      const tvbh = it.assignee?.trim() || 'chưa phân giao';
      return `• ${ten} ${maskPhone(it.phone)} — ${tvbh} — đã gọi ${it.noAnswerCount} lần`;
    });
  const remaining = total - top.length;
  const lines = [
    `<b>CẦN GỌI LẠI — ${showroom}</b>`,
    `<b>${total}</b> khách chưa liên hệ được, đề nghị gọi lại:`,
    ...top,
  ];
  if (remaining > 0) lines.push(`… và ${remaining} khách khác.`);
  lines.push('Vui lòng chủ động liên hệ lại khách.');
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

export interface BrandBreakView {
  name: string;
  stats: DailySrStats;
}

export interface ChannelPhongView {
  name: string;
  stats: DailySrStats;
  brands: BrandBreakView[];
  byModel: boolean;
  nonCompliant: NonCompliant[];
}

export interface ChannelReportView {
  dateLabel: string;
  headerName: string;
  overview: { stats: DailySrStats; brands: BrandBreakView[]; byModel: boolean };
  phongs: ChannelPhongView[];
}

// 1 dòng chi tiết 1 thương hiệu — đủ số như dòng tổng.
function renderBrandLine(b: BrandBreakView): string {
  const s = b.stats;
  return `· ${b.name} — Tổng ${s.total} · Đã LH ${s.contacted} · Chưa LH ${s.pending} · Quá hạn ${s.overdue} · KHQT ${s.KHQT} · GDTD ${s.GDTD} · Ký HĐ ${s.KyHD} · Loại ${s.Fail}`;
}

// Khối 1 phạm vi (tổng quan / 1 phòng): dòng tổng + phân loại + LUÔN chi tiết hãng.
// Chi tiết hãng bắt buộc hiện cho MỌI hãng phòng bán (kể cả 0 lead) — seed từ brand_ids.
function renderScopedStats(s: DailySrStats, brands: BrandBreakView[], byModel = false): string[] {
  const lines = [
    `Tổng lead: ${s.total} · Đã LH: ${s.contacted} (${pct(s.contacted, s.total)}%) · Chưa LH: ${s.pending} · Quá hạn: ${s.overdue}`,
    `Phân loại: KHQT ${s.KHQT} · GDTD ${s.GDTD} · Ký HĐ ${s.KyHD} · Loại ${s.Fail}`,
  ];
  if (brands.length > 0) {
    lines.push(byModel ? 'Chi tiết theo dòng xe:' : 'Chi tiết theo thương hiệu:');
    for (const b of brands) lines.push(renderBrandLine(b));
  }
  return lines;
}

// ————— BÁO CÁO KỲ DÀI (TUẦN / THÁNG): tập trung KẾT QUẢ, KHÔNG "quá hạn / chưa tuân thủ" —————
// Kỳ đã kết thúc nên chỉ nhìn kết quả tích luỹ: tổng lead, tỷ lệ liên hệ, phễu chốt
// (KHQT → Đàm phán → Ký HĐ), tỷ lệ chốt và SO SÁNH kỳ trước.

// So sánh 1 chỉ số với kỳ trước: ↑ tăng, ↓ giảm, → không đổi.
export function deltaStr(cur: number, prev: number): string {
  const d = cur - prev;
  if (d > 0) return `↑${d}`;
  if (d < 0) return `↓${-d}`;
  return '→0';
}

// Khối kết quả 1 phạm vi kỳ dài (showroom / phòng / tổng quan): tổng + so kỳ trước,
// đã liên hệ, phễu chốt, tỷ lệ chốt, chi tiết hãng. KHÔNG "quá hạn / chưa tuân thủ".
function renderPeriodScopedStats(cur: DailySrStats, prev: DailySrStats, brands: BrandBreakView[], byModel = false): string[] {
  const winRate = pct(cur.KyHD, cur.total);
  const lines = [
    `Tổng lead: <b>${cur.total}</b> (${deltaStr(cur.total, prev.total)} so kỳ trước)`,
    `Đã liên hệ: ${cur.contacted} (${pct(cur.contacted, cur.total)}%)`,
    `Phễu chốt: KHQT ${cur.KHQT} → Đàm phán ${cur.GDTD} → Ký HĐ <b>${cur.KyHD}</b>`,
    `Tỷ lệ chốt: <b>${winRate}%</b> · Đã loại: ${cur.Fail}`,
  ];
  if (brands.length > 0) {
    lines.push(byModel ? 'Chi tiết theo dòng xe:' : 'Chi tiết theo thương hiệu:');
    for (const b of brands) {
      lines.push(`· ${b.name}: ${b.stats.total} lead · Ký HĐ ${b.stats.KyHD} · chốt ${pct(b.stats.KyHD, b.stats.total)}%`);
    }
  }
  return lines;
}

// Dòng chốt "Kỳ trước" — nhắc lại số kỳ liền trước để đối chiếu nhanh.
function renderPrevFoot(prevLabel: string, prev: DailySrStats): string {
  return `—— Kỳ trước (${prevLabel}): ${prev.total} lead · Ký HĐ ${prev.KyHD} · chốt ${pct(prev.KyHD, prev.total)}%`;
}

// Báo cáo TUẦN/THÁNG của 1 showroom (gửi nhóm BLĐ showroom). dateLabel/prevLabel đã gồm từ chỉ kỳ.
export function renderPeriodSr(
  showroom: string, dateLabel: string, prevLabel: string,
  cur: DailySrStats, prev: DailySrStats, brands: BrandBreakView[], byModel = false,
): string {
  return [
    `<b>BÁO CÁO ${dateLabel} — ${showroom}</b>`,
    ...renderPeriodScopedStats(cur, prev, brands, byModel),
    renderPrevFoot(prevLabel, prev),
  ].join('\n');
}

export interface ChannelPeriodPhongView {
  name: string;
  cur: DailySrStats;
  prev: DailySrStats;
  brands: BrandBreakView[];
  byModel: boolean;
}

export interface ChannelPeriodView {
  dateLabel: string;
  prevLabel: string;
  headerName: string;
  overview: { cur: DailySrStats; prev: DailySrStats; brands: BrandBreakView[]; byModel: boolean };
  phongs: ChannelPeriodPhongView[];
}

// Báo cáo TUẦN/THÁNG của 1 kênh Zalo nhóm bán hàng (nhiều phòng). Tập trung KẾT QUẢ + so kỳ trước.
// Kênh 1 phòng → bỏ TỔNG QUAN, hiện thẳng 1 khối; nhiều phòng → TỔNG QUAN + từng phòng.
export function renderChannelPeriod(r: ChannelPeriodView): string {
  if (r.phongs.length === 1) {
    const p = r.phongs[0];
    return [
      `<b>BÁO CÁO ${r.dateLabel} — ${p.name}</b>`,
      ...renderPeriodScopedStats(p.cur, p.prev, p.brands, p.byModel),
      renderPrevFoot(r.prevLabel, p.prev),
    ].join('\n');
  }
  const parts: string[] = [
    `<b>BÁO CÁO ${r.dateLabel} — ${r.headerName}</b>`,
    '',
    '<b>TỔNG QUAN</b>',
    ...renderPeriodScopedStats(r.overview.cur, r.overview.prev, r.overview.brands, r.overview.byModel),
  ];
  for (const p of r.phongs) {
    parts.push('───────────────');
    parts.push(`<b>PHÒNG ${p.name}</b>`);
    parts.push(...renderPeriodScopedStats(p.cur, p.prev, p.brands, p.byModel));
  }
  parts.push('───────────────');
  parts.push(renderPrevFoot(r.prevLabel, r.overview.prev));
  return parts.join('\n');
}

export interface PeriodMgmtRow {
  showroom: string;
  cur: DailySrStats;
  prev: DailySrStats;
}

// Bảng tổng hợp BLĐ toàn công ty cho kỳ TUẦN/THÁNG: dòng TỔNG (kèm so kỳ trước) + xếp hạng showroom theo Ký HĐ.
export function renderPeriodMgmt(
  dateLabel: string, prevLabel: string,
  rows: PeriodMgmtRow[], curTotals: DailySrStats, prevTotals: DailySrStats,
): string {
  const winRate = pct(curTotals.KyHD, curTotals.total);
  const head = `<b>BÁO CÁO ${dateLabel} — TỔNG HỢP BLĐ</b>`;
  const totalLine = `TỔNG: <b>${curTotals.total}</b> lead (${deltaStr(curTotals.total, prevTotals.total)}) · Ký HĐ <b>${curTotals.KyHD}</b> (${deltaStr(curTotals.KyHD, prevTotals.KyHD)}) · Tỷ lệ chốt ${winRate}%`;
  const contactLine = `Đã liên hệ ${curTotals.contacted} (${pct(curTotals.contacted, curTotals.total)}%) · KHQT ${curTotals.KHQT} · Đàm phán ${curTotals.GDTD}`;
  const sorted = [...rows].sort((a, b) => b.cur.KyHD - a.cur.KyHD || b.cur.total - a.cur.total);
  const body = sorted.map((r, i) =>
    `${i + 1}. ${r.showroom}: ${r.cur.total} lead · Ký HĐ ${r.cur.KyHD} · chốt ${pct(r.cur.KyHD, r.cur.total)}%`);
  const foot = `—— Kỳ trước (${prevLabel}): ${prevTotals.total} lead · Ký HĐ ${prevTotals.KyHD}`;
  return [head, totalLine, contactLine, '———', 'Xếp hạng showroom (theo Ký HĐ):', ...body, foot].join('\n');
}

// Báo cáo ngày của 1 kênh Zalo nhiều phòng. Kênh 1 phòng → bỏ TỔNG QUAN, hiện thẳng 1 khối.
export function renderChannelDaily(r: ChannelReportView): string {
  if (r.phongs.length === 1) {
    const p = r.phongs[0];
    return [
      `BÁO CÁO ${r.dateLabel} — ${p.name}`,
      ...renderScopedStats(p.stats, p.brands, p.byModel),
      renderNonCompliant(p.nonCompliant),
    ].join('\n');
  }
  const parts: string[] = [
    `BÁO CÁO ${r.dateLabel} — ${r.headerName}`,
    '',
    '<b>TỔNG QUAN</b>',
    ...renderScopedStats(r.overview.stats, r.overview.brands, r.overview.byModel),
  ];
  for (const p of r.phongs) {
    parts.push('───────────────');
    parts.push(`<b>PHÒNG ${p.name}</b>`);
    parts.push(...renderScopedStats(p.stats, p.brands, p.byModel));
    parts.push(renderNonCompliant(p.nonCompliant));
  }
  return parts.join('\n');
}
