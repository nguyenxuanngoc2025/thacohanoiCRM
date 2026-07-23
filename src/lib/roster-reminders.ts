// Nhắc đặt lịch trực NGÀY KẾ TIẾP cho showroom chia lead theo lịch trực ('day_roster').
// Thuần logic (không I/O) để test đủ nhánh; route /api/cron/roster-reminders gọi các hàm này.

/** Đổi 'YYYY-MM-DD' sang 'DD/MM/YYYY' để hiển thị cho người dùng. */
export function fmtRosterDate(dateStr: string): string {
  const [y, m, d] = (dateStr ?? '').split('-');
  if (!y || !m || !d) return dateStr ?? '';
  return `${d}/${m}/${y}`;
}

export interface RosterShowroom {
  id: string;
  name: string;
}

/**
 * Lọc ra showroom CHƯA đặt lịch trực cho ngày kế tiếp.
 * - `showrooms`: các showroom chia lead theo lịch trực đang bật.
 * - `rosteredIds`: tập showroom_id ĐÃ có dòng lịch trực (sales_team_id KHÁC null) cho ngày đó.
 */
export function pickShowroomsMissingRoster(
  showrooms: RosterShowroom[],
  rosteredIds: Set<string>,
): RosterShowroom[] {
  return showrooms.filter((s) => !rosteredIds.has(s.id));
}

/** Câu nhắc gửi tới nhóm Zalo BLĐ showroom (đủ dấu, không emoji). */
export function buildRosterReminderText(showroomName: string, tomorrowLabel: string): string {
  return `[NHẮC LỊCH TRỰC] Showroom ${showroomName} chưa đặt lịch trực nhận lead cho ngày mai (${tomorrowLabel}). Vui lòng vào mục Phân giao để đăng ký phòng trực, tránh lead ngày mai không có phòng nhận.`;
}
