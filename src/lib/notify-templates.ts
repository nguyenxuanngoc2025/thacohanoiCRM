// Hàm thuần render nội dung tin Zalo. KHÔNG emoji (preference user).
// zca-bot chỉ gửi payload.text — mọi logic nội dung nằm ở đây.
// Định dạng: bọc <b>...</b> = chữ ĐẬM, <i>...</i> = chữ NGHIÊNG; zca-bot đổi tag này
// thành style của Zalo (offset tính trên text cuối, sau khi bù tên). Tag chỉ phục vụ tin Zalo,
// không hiện trên app. Dùng tag <b>/<i> (không phải **...**) để KHÔNG đụng dấu * trong SĐT che (***).

import { formatPhoneDisplay } from './phone';
import { sourcePlatform, sourceLabel, type SourceCatalog } from './source';
import { STATUS_LABEL, type LeadStatus } from './lead-status';

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
    `Hôm nay (${ddmm}) chưa đặt phòng trực nhận Lead. Lead mới đang chờ, <b>CHƯA phân giao</b>.`,
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

export interface ReturningLeadInput {
  showroom: string;
  // Tên phòng ĐANG chăm (fallback showroom) → tiêu đề tin.
  team: string | null;
  fullName: string | null;
  phone: string;
  // Kênh MỚI mà khách vừa hỏi lại (Facebook/Zalo…).
  source: string | null;
  // Kênh BAN ĐẦU của lead cũ (khách từng đến qua kênh này). null = không rõ.
  originalSource?: string | null;
  // Nội dung khách hỏi lần này (nếu bắt được từ intent_text).
  inquiry: string | null;
  // TVBH đang chăm hiện tại (null = chưa phân giao).
  assignee: string | null;
  // Phân loại hiện tại của lead cũ (null = chưa phân loại).
  status: LeadStatus | null;
  catalog?: SourceCatalog;
}

// Tin "khách cũ hỏi lại" — bắn vào ĐÚNG nhóm phòng đang chăm khách đó khi có data mới trùng SĐT.
// Mục đích: cảnh báo đây là KH cũ quay lại, nội dung gì, ai đang chăm, phân loại ra sao → không tạo lead mới.
export function renderReturningLead(i: ReturningLeadInput): string {
  const ten = i.fullName?.trim() || 'Khách lẻ';
  const platform = sourcePlatform(i.source, i.catalog);
  const detail = sourceLabel(i.source, i.catalog);
  const nguon = detail !== '—' ? `${platform} · ${detail}` : platform;
  // Kênh ban đầu (nơi khách từng đến) — chỉ hiện khi có và KHÁC kênh mới, để thấy rõ đa kênh.
  const origPlatform = i.originalSource ? sourcePlatform(i.originalSource, i.catalog) : null;
  const origDetail = i.originalSource ? sourceLabel(i.originalSource, i.catalog) : '—';
  const nguonGoc = origPlatform ? (origDetail !== '—' ? `${origPlatform} · ${origDetail}` : origPlatform) : null;
  const showOrig = !!nguonGoc && nguonGoc !== nguon;
  const dangCham = i.assignee?.trim() ? `<b>${i.assignee.trim()}</b>` : '<b>CHƯA CÓ TVBH</b>';
  const phanLoai = i.status ? STATUS_LABEL[i.status] : 'Chưa phân loại';
  const scope = i.team?.trim() || i.showroom;
  const lines = [
    `<b>DATA KH CŨ HỎI LẠI — ${scope}</b>`,
    `KH: <b>${ten}</b> · ${maskPhone(i.phone)}`,
  ];
  if (showOrig) lines.push(`Kênh ban đầu: ${nguonGoc}`);
  lines.push(showOrig ? `Đang hỏi thêm ở: ${nguon}` : `Kênh mới: ${nguon}`);
  const inq = i.inquiry?.trim();
  if (inq) {
    const short = inq.length > B10_NOTE_CAP ? inq.slice(0, B10_NOTE_CAP) + '…' : inq;
    lines.push(`Nội dung hỏi: <i>${short}</i>`);
  }
  lines.push(`Đang chăm: ${dangCham}`);
  lines.push(`Phân loại hiện tại: ${phanLoai}`);
  lines.push('<i>Khách cũ quay lại — vào chăm sóc tiếp.</i>');
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
  const rows = perAssignee.map((a) => `• ${a.name} — ${a.count} Lead`);
  return [
    `<b>PHÂN GIAO — ${showroom}</b>`,
    `<b>${total}</b> Lead vừa được giao:`,
    ...rows,
    '<b>Yêu cầu các TVBH vào chăm sóc ngay.</b>',
  ].join('\n');
}

export interface UnassignedItem {
  fullName: string | null;
  phone: string;
  waitMinutes: number; // thời gian tồn hàng chờ tính từ created_at
}

// Tin nhắc lead tồn hàng chờ chưa giao TVBH: liệt kê đầy đủ, chờ lâu nhất lên trước.
export function renderUnassignedReminder(team: string, items: UnassignedItem[]): string {
  const total = items.length;
  const maxWait = items.reduce((m, it) => Math.max(m, it.waitMinutes), 0);
  const listed = [...items]
    .sort((a, b) => b.waitMinutes - a.waitMinutes)
    .slice(0, OVERDUE_LIST_MAX)
    .map((it) => {
      const ten = it.fullName?.trim() || 'Khách lẻ';
      return `• ${ten} ${maskPhone(it.phone)} — chờ ${formatDuration(it.waitMinutes)}`;
    });
  const remaining = total - listed.length;
  const lines = [
    `<b>CHƯA PHÂN GIAO — ${team}</b>`,
    `<b>${total}</b> Lead đang chờ phân giao (chờ lâu nhất ${formatDuration(maxWait)}):`,
    ...listed,
  ];
  if (remaining > 0) lines.push(`… và ${remaining} Lead khác.`);
  lines.push('Vào hệ thống giao cho TVBH ngay.');
  return lines.join('\n');
}

export interface OverdueItem {
  fullName: string | null;
  phone: string;
  assignee: string | null;
  // Thời gian khách đã chờ chưa được liên hệ, TÍNH TỪ LÚC GIAO lead (đơn vị phút).
  overdueMinutes: number;
}

// Định dạng thời lượng chờ theo "giờ + phút" cho dễ đọc — không bao giờ hiện trơ "0 giờ".
// < 1 giờ → "X phút"; tròn giờ → "X giờ"; lẻ → "X giờ Y phút".
function formatDuration(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} giờ` : `${h} giờ ${r} phút`;
}

// Callback: chỉ nêu vài khách gọi hụt nhiều nhất để tin gọn.
const OVERDUE_TOP = 3;
// Quá hạn: LIỆT KÊ đầy đủ danh sách KH quá hạn trong 1 tin (gom theo phòng), gấp nhất
// lên trước. Có ngưỡng an toàn kẻo tin quá dài bị Zalo từ chối; dư mới gói "… và N khác".
const OVERDUE_LIST_MAX = 30;

export function renderOverdue(showroom: string, items: OverdueItem[]): string {
  const total = items.length;
  const unassigned = items.filter((it) => !it.assignee?.trim()).length;
  const assigned = total - unassigned;
  const maxOverdue = items.reduce((m, it) => Math.max(m, it.overdueMinutes), 0);

  // Liệt kê toàn bộ KH quá hạn (gấp nhất — chờ lâu nhất — lên trước), tới ngưỡng an toàn.
  const listed = [...items]
    .sort((a, b) => b.overdueMinutes - a.overdueMinutes)
    .slice(0, OVERDUE_LIST_MAX)
    .map((it) => {
      const ten = it.fullName?.trim() || 'Khách lẻ';
      const tvbh = it.assignee?.trim() || 'chưa phân giao';
      return `• ${ten} ${maskPhone(it.phone)} — ${tvbh} — ${formatDuration(it.overdueMinutes)}`;
    });
  const remaining = total - listed.length;

  const lines = [
    `<b>QUÁ HẠN LIÊN HỆ — ${showroom}</b>`,
    `Tổng <b>${total}</b> Lead · Chưa phân giao ${unassigned} · Đã giao ${assigned}`,
    `Quá hạn lâu nhất: ${formatDuration(maxOverdue)}`,
    '',
    'Danh sách KH quá hạn (gấp nhất trước):',
    ...listed,
  ];
  if (remaining > 0) lines.push(`… và ${remaining} Lead khác.`);
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

// Đường kẻ ngăn cách các phần trong tin — làm báo cáo dễ đọc, gọn mắt.
const SEP = '───────────────';

export interface NonCompliant {
  name: string;       // tên TVBH, hoặc 'Chưa phân'
  overdue: number;    // số lead quá hạn của người này
}

// Dòng tổng NGÀY: chỉ 3 con số cốt lõi (in đậm), nhấn liên hệ + khách quan tâm.
function dailyHeadline(s: DailySrStats): string {
  return `Tổng Lead: <b>${s.total}</b>, trong đó đã liên hệ <b>${s.contacted}</b>. Có <b>${s.KHQT}</b> KHQT`;
}

// Dòng tổng KỲ DÀI (tuần/tháng): tổng + so kỳ trước, nhấn số KHĐ (ký hợp đồng).
function periodHeadline(cur: DailySrStats, prev: DailySrStats): string {
  return `Tổng Lead: <b>${cur.total}</b> (${deltaStr(cur.total, prev.total)} so kỳ trước), trong đó đã liên hệ <b>${cur.contacted}</b>. KHĐ <b>${cur.KyHD}</b>`;
}

// 1 dòng bullet cho báo cáo NGÀY (thương hiệu / dòng xe / phòng): tên đậm + số đậm.
function dailyBreakLine(name: string, s: DailySrStats): string {
  return `• <b>${name}</b>: <b>${s.total}</b> Lead · Đã LH <b>${s.contacted}</b> · KHQT <b>${s.KHQT}</b>`;
}

// 1 dòng bullet cho báo cáo KỲ DÀI (thương hiệu / dòng xe / phòng): nhấn KHĐ.
function periodBreakLine(name: string, s: DailySrStats): string {
  return `• <b>${name}</b>: <b>${s.total}</b> Lead · KHĐ <b>${s.KyHD}</b>`;
}

// Khối chi tiết hãng/dòng xe cho MỌI báo cáo.
// - kind: 'daily' nhấn KHQT / 'period' nhấn KHĐ.
// - always=true (nhóm BLĐ): LUÔN hiện dù chỉ 1 mục (đây là nội dung chính).
//   always=false (phòng/showroom): chỉ nêu khi đáng — nhiều thương hiệu, hoặc bất kỳ dòng xe
//   nào (phòng Tải Bus); 1 hãng duy nhất → bỏ để tin gọn.
function breakBlock(
  brands: BrandBreakView[], byModel: boolean, kind: 'daily' | 'period', always: boolean,
): string[] {
  if (always ? brands.length === 0 : (byModel ? brands.length === 0 : brands.length <= 1)) return [];
  const head = byModel ? 'Theo dòng xe' : 'Theo thương hiệu';
  const line = kind === 'daily' ? dailyBreakLine : periodBreakLine;
  return [SEP, `<b>${head}</b>`, ...brands.map((b) => line(b.name, b.stats))];
}

// Gộp danh sách "chưa tuân thủ" của nhiều phòng theo tên TVBH (cộng số lead quá hạn).
function mergeNonCompliant(lists: NonCompliant[][]): NonCompliant[] {
  const m = new Map<string, number>();
  for (const list of lists) for (const nc of list) m.set(nc.name, (m.get(nc.name) ?? 0) + nc.overdue);
  return [...m.entries()].map(([name, overdue]) => ({ name, overdue })).sort((a, b) => b.overdue - a.overdue);
}

// Khối "Chưa tuân thủ": tên TVBH đậm + số lead quá hạn. Rỗng → ghi rõ đã tuân thủ.
const NON_COMPLIANT_MAX = 8;
function nonCompliantBlock(list: NonCompliant[]): string {
  const lines = [SEP, '<b>Chưa tuân thủ</b>'];
  if (list.length === 0) {
    lines.push('• Không có Lead quá hạn chưa liên hệ');
    return lines.join('\n');
  }
  for (const x of list.slice(0, NON_COMPLIANT_MAX)) {
    lines.push(`• <b>${x.name}</b> — ${x.overdue} Lead quá hạn chưa liên hệ`);
  }
  if (list.length > NON_COMPLIANT_MAX) lines.push(`• …và ${list.length - NON_COMPLIANT_MAX} người khác`);
  return lines.join('\n');
}

// Tiêu đề 2 dòng: tên báo cáo (kỳ) + phạm vi (phòng/showroom/nhóm) — đều in đậm.
function reportHeader(dateLabel: string, scope: string): string[] {
  return [`<b>BÁO CÁO ${dateLabel}</b>`, `<b>${scope}</b>`, SEP];
}

// dateLabel đã gồm từ chỉ kỳ: 'NGÀY 24/06' | 'TUẦN 23/06–29/06' | 'THÁNG 06/2026'.
export function renderDailySr(
  showroom: string, dateLabel: string, s: DailySrStats, nonCompliant: NonCompliant[],
  brands: BrandBreakView[] = [], byModel = false,
): string {
  return [
    ...reportHeader(dateLabel, showroom),
    dailyHeadline(s),
    ...breakBlock(brands, byModel, 'daily', false),
    nonCompliantBlock(nonCompliant),
  ].join('\n');
}

// Báo cáo NGÀY nhóm BLĐ toàn công ty: dòng tổng + chi tiết Theo thương hiệu (hoặc dòng xe).
export function renderDailyMgmt(
  dateLabel: string, stats: DailySrStats, brands: BrandBreakView[], byModel = false,
): string {
  return [
    ...reportHeader(dateLabel, 'TỔNG HỢP BAN LÃNH ĐẠO'),
    dailyHeadline(stats),
    ...breakBlock(brands, byModel, 'daily', true),
  ].join('\n');
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

// ————— BÁO CÁO KỲ DÀI (TUẦN / THÁNG): tập trung KẾT QUẢ, KHÔNG "quá hạn / chưa tuân thủ" —————
// Kỳ đã kết thúc nên chỉ nhìn kết quả tích luỹ: tổng Lead, đã liên hệ, số KHĐ, SO SÁNH kỳ trước.

// So sánh 1 chỉ số với kỳ trước: ↑ tăng, ↓ giảm, → không đổi.
export function deltaStr(cur: number, prev: number): string {
  const d = cur - prev;
  if (d > 0) return `↑${d}`;
  if (d < 0) return `↓${-d}`;
  return '→0';
}

// Dòng chốt "Kỳ trước" — nhắc lại số kỳ liền trước (in nghiêng) để đối chiếu nhanh.
function renderPrevFoot(prevLabel: string, prev: DailySrStats): string {
  return `${SEP}\n<i>Kỳ trước (${prevLabel}): ${prev.total} Lead · KHĐ ${prev.KyHD}</i>`;
}

// Báo cáo TUẦN/THÁNG của 1 showroom (gửi nhóm BLĐ showroom). dateLabel/prevLabel đã gồm từ chỉ kỳ.
export function renderPeriodSr(
  showroom: string, dateLabel: string, prevLabel: string,
  cur: DailySrStats, prev: DailySrStats, brands: BrandBreakView[], byModel = false,
): string {
  return [
    ...reportHeader(dateLabel, showroom),
    periodHeadline(cur, prev),
    ...breakBlock(brands, byModel, 'period', false),
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

// Báo cáo TUẦN/THÁNG của 1 kênh Zalo nhóm bán hàng. Tập trung KẾT QUẢ + so kỳ trước.
// 1 phòng → 1 khối gọn; nhiều phòng → tổng quan + mục "Theo phòng bán hàng".
export function renderChannelPeriod(r: ChannelPeriodView): string {
  const single = r.phongs.length === 1;
  const cur = single ? r.phongs[0].cur : r.overview.cur;
  const prev = single ? r.phongs[0].prev : r.overview.prev;
  const brands = single ? r.phongs[0].brands : r.overview.brands;
  const byModel = single ? r.phongs[0].byModel : r.overview.byModel;
  const parts: string[] = [
    ...reportHeader(r.dateLabel, single ? r.phongs[0].name : r.headerName),
    periodHeadline(cur, prev),
    ...breakBlock(brands, byModel, 'period', false),
  ];
  if (!single) {
    parts.push(SEP, '<b>Theo phòng bán hàng</b>');
    for (const p of r.phongs) parts.push(periodBreakLine(p.name, p.cur));
  }
  parts.push(renderPrevFoot(r.prevLabel, prev));
  return parts.join('\n');
}

// Báo cáo TUẦN/THÁNG nhóm BLĐ toàn công ty: dòng tổng (so kỳ trước) + chi tiết Theo thương hiệu (hoặc dòng xe).
export function renderPeriodMgmt(
  dateLabel: string, prevLabel: string,
  curTotals: DailySrStats, prevTotals: DailySrStats, brands: BrandBreakView[], byModel = false,
): string {
  return [
    ...reportHeader(dateLabel, 'TỔNG HỢP BAN LÃNH ĐẠO'),
    periodHeadline(curTotals, prevTotals),
    ...breakBlock(brands, byModel, 'period', true),
    renderPrevFoot(prevLabel, prevTotals),
  ].join('\n');
}

export interface BrandBlockView {
  brandName: string;
  stats: DailySrStats;
  models: BrandBreakView[];
}

export interface BrandReportView {
  dateLabel: string;
  headerName: string;
  blocks: BrandBlockView[];
}

// Báo cáo nhóm BLĐ thương hiệu: mỗi hãng 1 khối, nối bằng dòng trống. KHÔNG so kỳ trước.
export function renderBrandReport(r: BrandReportView): string {
  const blocks = r.blocks.map((b) => {
    const lines = [
      ...reportHeader(r.dateLabel, `${r.headerName} · ${b.brandName}`),
      dailyHeadline(b.stats),
      SEP,
      '<b>Theo dòng xe</b>',
      ...(b.models.length ? b.models.map((m) => dailyBreakLine(m.name, m.stats)) : ['• chưa có']),
    ];
    return lines.join('\n');
  });
  return blocks.join('\n\n');
}

// Báo cáo NGÀY của 1 kênh Zalo. 1 phòng → 1 khối gọn; nhiều phòng → tổng quan +
// mục "Theo phòng bán hàng" + "Chưa tuân thủ" gộp toàn kênh.
export function renderChannelDaily(r: ChannelReportView): string {
  const single = r.phongs.length === 1;
  const stats = single ? r.phongs[0].stats : r.overview.stats;
  const brands = single ? r.phongs[0].brands : r.overview.brands;
  const byModel = single ? r.phongs[0].byModel : r.overview.byModel;
  const parts: string[] = [
    ...reportHeader(r.dateLabel, single ? r.phongs[0].name : r.headerName),
    dailyHeadline(stats),
    ...breakBlock(brands, byModel, 'daily', false),
  ];
  if (!single) {
    parts.push(SEP, '<b>Theo phòng bán hàng</b>');
    for (const p of r.phongs) parts.push(dailyBreakLine(p.name, p.stats));
  }
  const nc = single ? r.phongs[0].nonCompliant : mergeNonCompliant(r.phongs.map((p) => p.nonCompliant));
  parts.push(nonCompliantBlock(nc));
  return parts.join('\n');
}
