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

const OS_TIMERS = [
  'apt-daily', 'apt-listchanges', 'dpkg-db-backup', 'e2scrub', 'exim4', 'fstrim',
  'man-db', 'systemd-tmpfiles-clean', 'logrotate',
];

/** Phân nhóm timer + cờ nguy hiểm (mọi timer ngoài CRM đều nguy hiểm — cần xác nhận gắt). */
export function classifyTimer(name: string): { group: TimerGroup; dangerous: boolean } {
  const base = name.replace(/\.timer$/, '');
  if (base.startsWith('cron-') || base.startsWith('zca-bot')) return { group: 'crm', dangerous: false };
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
  'cron-enrich-names': 'Dò tên khách từ Zalo để điền cho các lead còn thiếu tên.',
  'cron-google-sheets': 'Đồng bộ lead mới từ Google Sheet của agency về CRM.',
  'cron-poll-fb-messages': 'Quét tin nhắn Facebook mới, tạo thành lead trong CRM.',
  'cron-poll-fb-comments': 'Quét bình luận Facebook mới, tạo thành lead trong CRM.',
  'zca-bot-heal': 'Tự kiểm tra và hồi phục bot Zalo nếu bị rớt, giúp tin báo không bị nghẽn.',
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
