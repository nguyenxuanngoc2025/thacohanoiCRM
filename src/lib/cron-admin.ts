/**
 * Logic THUẦN cho trang quản lý cron (systemd timer) — không I/O, dễ test.
 * Parse output systemctl, đổi preset UI → OnCalendar, phân loại timer, tính đèn trạng thái.
 * Phần chạy lệnh thật nằm ở lib/systemd.ts.
 */

export type TimerGroup = 'crm' | 'infra' | 'os';

export interface UnitFileRow {
  unit: string;
  state: string; // enabled | disabled | static | masked ...
}

/** Parse `systemctl list-unit-files --type=timer --no-legend --plain`. Chỉ giữ dòng .timer. */
export function parseUnitFiles(raw: string): UnitFileRow[] {
  const rows: UnitFileRow[] = [];
  for (const line of raw.split('\n')) {
    const parts = line.trim().split(/\s+/);
    const unit = parts[0];
    if (!unit || !unit.endsWith('.timer')) continue;
    rows.push({ unit, state: parts[1] ?? '' });
  }
  return rows;
}

/** Parse output `systemctl show <unit> -p ...` (key=value mỗi dòng) → object. Tách theo dấu = ĐẦU TIÊN. */
export function parseUnitShow(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const i = line.indexOf('=');
    if (i < 0) continue;
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

/** Lấy mọi chuỗi OnCalendar từ các dòng `TimersCalendar={ OnCalendar=... ; next_elapse=... }`. */
export function parseTimersCalendar(raw: string): string[] {
  const out: string[] = [];
  const re = /OnCalendar=(.+?)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) out.push(m[1].trim());
  return out;
}

/**
 * Đổi mốc thời gian systemd (chuỗi UTC dạng "Mon 2026-07-20 03:30:00 UTC") sang
 * giờ Việt Nam hiển thị "dd/MM/yyyy HH:mm". Trống / n/a / infinity → chuỗi rỗng.
 * Máy chủ chạy UTC nên phần số trong chuỗi được coi là UTC rồi quy về Asia/Ho_Chi_Minh.
 */
export function formatVnTime(systemdTs: string): string {
  const s = (systemdTs ?? '').trim();
  if (!s || s === 'n/a' || /infinity/i.test(s)) return '';
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return s;
  const [, y, mo, d, h, mi, sec] = m;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec));
  if (Number.isNaN(dt.getTime())) return s;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(dt);
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`;
}

const OS_TIMERS = [
  'apt-daily', 'apt-listchanges', 'dpkg-db-backup', 'e2scrub', 'exim4', 'fstrim',
  'man-db', 'systemd-tmpfiles-clean', 'logrotate',
];

/** Phân nhóm timer + cờ nguy hiểm (mọi timer ngoài CRM đều nguy hiểm — cần xác nhận gắt). */
export function classifyTimer(name: string): { group: TimerGroup; dangerous: boolean } {
  const base = name.replace(/\.timer$/, '');
  if (base.startsWith('cron-') || base.startsWith('zca-bot') || base === 'leads-export') {
    return { group: 'crm', dangerous: false };
  }
  if (base === 'certbot' || base.includes('supabase-backup') || base.includes('backup')) {
    return { group: 'infra', dangerous: true };
  }
  if (OS_TIMERS.some((t) => base.startsWith(t))) return { group: 'os', dangerous: true };
  return { group: 'infra', dangerous: true };
}

/**
 * Giải thích DỄ HIỂU từng tác vụ tự động cho người vận hành (không rành kỹ thuật).
 * Khoá = tên base (bỏ .timer). Thiếu thì rơi về mô tả systemd, thiếu nữa thì câu chung.
 */
const CRON_EXPLAIN: Record<string, string> = {
  // CRM
  'cron-health-digest': 'Gửi báo cáo tình trạng hệ thống về Zalo cá nhân của bạn lúc 6h sáng và 20h tối — để bạn yên tâm mọi kênh thu lead vẫn chạy.',
  'cron-watchdog': 'Canh gác tự động (30 phút/lần). Nếu phát hiện mất kết nối kênh, bot Zalo chết, hay tin báo dồn ứ thì cảnh báo NGAY về Zalo.',
  'cron-daily-report': 'Cuối ngày tổng hợp số lead trong ngày rồi gửi báo cáo vào các nhóm Zalo phòng bán hàng.',
  'cron-weekly-report': 'Gửi báo cáo tổng kết theo tuần.',
  'cron-monthly-report': 'Gửi báo cáo tổng kết theo tháng.',
  'cron-reminders': 'Nhắc tư vấn viên chăm sóc những lead sắp/đã quá hạn liên hệ.',
  'cron-roster-reminders': 'Chiều tối nhắc BLĐ showroom (chia lead theo lịch trực) đăng ký phòng trực cho ngày mai nếu chưa đặt — tránh lead ngày mai không có phòng nhận.',
  'cron-enrich-names': 'Dò tên khách từ Zalo để điền cho các lead còn thiếu tên.',
  'cron-google-sheets': 'Đồng bộ lead mới từ Google Sheet của agency về CRM.',
  'cron-poll-fb-messages': 'Quét tin nhắn Facebook mới, tạo thành lead trong CRM.',
  'cron-poll-fb-comments': 'Quét bình luận Facebook mới, tạo thành lead trong CRM.',
  'zca-bot-heal': 'Tự kiểm tra và hồi phục bot Zalo nếu bị rớt, giúp tin báo không bị nghẽn.',
  'leads-export': 'Mỗi giờ xuất bảng lead của từng công ty ra file CSV rồi tải lên Google Drive — để phòng khi CRM lỗi vẫn còn dữ liệu khách hàng.',
  // Hạ tầng
  'certbot': 'Tự động gia hạn chứng chỉ bảo mật (HTTPS) cho website — hết hạn thì web báo "không an toàn".',
  'supabase-backup': 'Sao lưu toàn bộ cơ sở dữ liệu để phòng khi cần khôi phục.',
  // Hệ điều hành
  'apt-daily': 'Máy chủ tải danh sách cập nhật phần mềm hệ thống.',
  'apt-daily-upgrade': 'Máy chủ cài các bản cập nhật bảo mật hệ thống.',
  'apt-listchanges': 'Ghi chú các thay đổi khi cập nhật phần mềm hệ thống.',
  'dpkg-db-backup': 'Sao lưu danh mục phần mềm đã cài trên máy chủ.',
  'e2scrub_all': 'Kiểm tra tính toàn vẹn của ổ đĩa.',
  'exim4-base': 'Bảo trì hệ thống thư nội bộ của máy chủ.',
  'fstrim': 'Dọn dẹp vùng trống trên ổ SSD để giữ ổ chạy nhanh.',
  'man-db': 'Cập nhật chỉ mục tài liệu hướng dẫn của hệ thống.',
  'systemd-tmpfiles-clean': 'Dọn các tệp tạm cũ trên máy chủ.',
  'logrotate': 'Xoay vòng và nén tệp nhật ký (log) để không làm đầy ổ đĩa.',
};

/** Câu giải thích dễ hiểu cho 1 timer. Fallback: mô tả systemd, rồi câu chung. */
export function explainCron(name: string, systemdDescription = ''): string {
  const base = name.replace(/\.timer$/, '');
  return CRON_EXPLAIN[base] || systemdDescription || 'Tác vụ tự động chạy định kỳ trên máy chủ.';
}

/**
 * Thứ tự hiển thị HỢP LÝ trong nhóm CRM: gom theo luồng (thu lead → báo cáo →
 * nhắc việc → canh gác → dự phòng); báo cáo xếp ngày → tuần → tháng. Timer ngoài
 * danh sách (hạ tầng/OS) nhận khoá lớn → rơi xuống cuối, sắp theo tên.
 */
const CRON_ORDER = [
  // Thu lead
  'cron-poll-fb-messages', 'cron-poll-fb-comments', 'cron-google-sheets', 'cron-enrich-names',
  // Báo cáo (ngày → tuần → tháng → sức khoẻ)
  'cron-daily-report', 'cron-weekly-report', 'cron-monthly-report', 'cron-health-digest',
  // Nhắc việc
  'cron-reminders', 'cron-roster-reminders',
  // Canh gác / hồi phục
  'cron-watchdog', 'zca-bot-heal',
  // Dự phòng
  'leads-export',
];

/** Khoá sắp xếp cho 1 timer (nhỏ = lên trước). Không có trong danh sách → về cuối. */
export function cronSortKey(unit: string): number {
  const base = unit.replace(/\.timer$/, '');
  const i = CRON_ORDER.indexOf(base);
  return i < 0 ? CRON_ORDER.length : i;
}

/**
 * Tên hiển thị NGẮN, dễ đọc tiếng Việt cho từng timer (giữ nguyên thuật ngữ như
 * Facebook, Zalo, Supabase, SSL). CHỈ là nhãn — tên kỹ thuật (unit) không đổi.
 */
const CRON_TITLE: Record<string, string> = {
  'cron-health-digest': 'Báo cáo sức khoẻ hệ thống',
  'cron-watchdog': 'Canh gác hệ thống',
  'cron-daily-report': 'Báo cáo lead cuối ngày',
  'cron-weekly-report': 'Báo cáo tuần',
  'cron-monthly-report': 'Báo cáo tháng',
  'cron-reminders': 'Nhắc chăm sóc lead',
  'cron-roster-reminders': 'Nhắc đặt lịch trực',
  'cron-enrich-names': 'Bổ sung tên khách',
  'cron-google-sheets': 'Đồng bộ Google Sheet',
  'cron-poll-fb-messages': 'Quét tin nhắn Facebook',
  'cron-poll-fb-comments': 'Quét bình luận Facebook',
  'zca-bot-heal': 'Hồi phục bot Zalo',
  'leads-export': 'Xuất dự phòng bảng lead',
  'certbot': 'Gia hạn chứng chỉ SSL',
  'supabase-backup': 'Sao lưu Supabase',
  'apt-daily': 'Kiểm tra cập nhật hệ thống',
  'apt-daily-upgrade': 'Cài cập nhật hệ thống',
  'apt-listchanges': 'Ghi chú cập nhật hệ thống',
  'dpkg-db-backup': 'Sao lưu danh mục phần mềm',
  'e2scrub_all': 'Kiểm tra ổ đĩa',
  'exim4-base': 'Bảo trì hệ thư (Exim4)',
  'fstrim': 'Dọn ổ SSD',
  'man-db': 'Cập nhật chỉ mục tài liệu',
  'systemd-tmpfiles-clean': 'Dọn file tạm',
  'logrotate': 'Xoay vòng nhật ký (log)',
};

/** Tên hiển thị dễ đọc cho 1 timer. Fallback: mô tả systemd, rồi tên unit (bỏ .timer). */
export function cronTitle(name: string, systemdDescription = ''): string {
  const base = name.replace(/\.timer$/, '');
  return CRON_TITLE[base] || systemdDescription || base;
}

const p2 = (n: number) => String(n).padStart(2, '0');
const VN_TZ = 'Asia/Ho_Chi_Minh';

export type Preset =
  | { kind: 'everyNMin'; n: number }
  | { kind: 'hourly' }
  | { kind: 'dailyAt'; hour: number; minute: number }
  | { kind: 'weeklyAt'; weekday: string; hour: number; minute: number };

/** Preset UI → chuỗi OnCalendar. Lịch theo ngày/tuần dùng giờ VN; theo phút thì độc lập múi giờ. */
export function presetToCalendar(p: Preset): string {
  switch (p.kind) {
    case 'everyNMin':
      return `*-*-* *:0/${p.n}:00`;
    case 'hourly':
      return '*-*-* *:00:00';
    case 'dailyAt':
      return `*-*-* ${p2(p.hour)}:${p2(p.minute)}:00 ${VN_TZ}`;
    case 'weeklyAt':
      return `${p.weekday} *-*-* ${p2(p.hour)}:${p2(p.minute)}:00 ${VN_TZ}`;
  }
}

const DOW_VN: Record<string, string> = {
  Mon: 'Thứ 2', Tue: 'Thứ 3', Wed: 'Thứ 4', Thu: 'Thứ 5',
  Fri: 'Thứ 6', Sat: 'Thứ 7', Sun: 'CN',
};

/** Mô tả phần thứ trong tuần: 'Mon..Sat' → "Thứ 2 đến Thứ 7"; 'Mon,Wed' → "Thứ 2, Thứ 4". */
function describeDow(tok: string): string {
  if (tok.includes('..')) {
    const [a, b] = tok.split('..');
    return `${DOW_VN[a] ?? a} đến ${DOW_VN[b] ?? b}`;
  }
  if (tok.includes(',')) return tok.split(',').map((d) => DOW_VN[d] ?? d).join(', ');
  return DOW_VN[tok] ?? tok;
}

const hm = (h: string, m: string) => `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;

/**
 * Đổi 1 chuỗi OnCalendar (systemd) sang mô tả tiếng Việt dễ đọc cho người vận hành.
 * Mọi lịch giờ cố định trong hệ đều gắn TZ Asia/Ho_Chi_Minh nên giờ hiển thị là giờ VN.
 * Không đọc được thì trả nguyên chuỗi (an toàn, không tệ hơn hiện tại).
 */
export function describeCalendar(cal: string): string {
  const s = (cal ?? '').trim();
  if (!s) return '';
  let dow = ''; let date = ''; let time = '';
  for (const t of s.split(/\s+/)) {
    if (/[A-Za-z]/.test(t) && t.includes('/') && !/^\d/.test(t)) continue; // TZ (Asia/Ho_Chi_Minh)
    if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(t)) { dow = t; continue; }
    if (t.includes(':')) { time = t; continue; }
    if (t.includes('-')) { date = t; continue; }
  }
  if (!time) return s;

  const [hStr, mStr] = time.split(':');
  const minStep = mStr.includes('/') ? Number(mStr.split('/')[1]) : null;
  const minFixed = mStr.replace(/\/.*/, '');

  // Nhịp theo phút / giờ (giờ = *): độc lập múi giờ.
  if (hStr === '*') {
    if (minStep != null) return `Mỗi ${minStep} phút`;
    if (minFixed === '00' || minFixed === '0') return 'Mỗi giờ';
    return `Mỗi giờ (phút ${minFixed.padStart(2, '0')})`;
  }

  // Khoảng giờ + bước phút, kèm khoảng thứ nếu có (vd nhắc chăm sóc lead).
  if (hStr.includes('..') && minStep != null) {
    const [a, b] = hStr.split('..');
    const prefix = dow ? `${describeDow(dow)}, ` : '';
    return `${prefix}${hm(a, '00')}–${hm(b, '00')}, mỗi ${minStep} phút`;
  }

  // Giờ cố định (1 mốc hoặc danh sách).
  const timeLabel = hStr.includes(',')
    ? hStr.split(',').map((h) => hm(h, minFixed)).join(' và ')
    : hm(hStr, minFixed);

  if (dow) return `${timeLabel} ${describeDow(dow)} hằng tuần`;
  if (date && /-\d{1,2}$/.test(date) && !date.endsWith('*')) {
    const day = date.slice(date.lastIndexOf('-') + 1).replace(/^0+/, '') || '0';
    return `${timeLabel} ngày ${day} hằng tháng`;
  }
  return `${timeLabel} hằng ngày`;
}

/** Nội dung file drop-in override: xoá lịch cũ (OnCalendar= rỗng) rồi thêm lịch mới. */
export function buildOverrideContent(calendars: string[]): string {
  const lines = ['[Timer]', 'OnCalendar='];
  for (const c of calendars) lines.push(`OnCalendar=${c}`);
  return lines.join('\n') + '\n';
}

/** Đèn trạng thái: xám=tắt, đỏ=lần chạy cuối lỗi, xanh=bật+ok. */
export function unitStatusLight(u: {
  unitFileState: string;
  activeState: string;
  lastResult: string;
}): 'green' | 'gray' | 'red' {
  const off = u.unitFileState === 'disabled' || u.unitFileState === 'masked' || u.activeState !== 'active';
  if (off) return 'gray';
  if (u.lastResult && u.lastResult !== 'success') return 'red';
  return 'green';
}
