// Lịch trực phòng nhận lead theo NGÀY (chiến lược showroom→phòng 'day_roster').
// Thuần logic (không I/O) để test dễ; ingest.ts gọi để quyết định phòng nhận.

/** Ngày hiện tại theo giờ VN (UTC+7), dạng 'YYYY-MM-DD' — khớp cột roster_date. */
export function vnDateStr(now: Date): string {
  const vn = new Date(now.getTime() + 7 * 3600000);
  const y = vn.getUTCFullYear();
  const m = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const d = String(vn.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type RosterMode = 'assign' | 'fallback' | 'unassigned';

/**
 * Quyết định phòng trực cho lead đang vào, dựa trên phòng đặt lịch hôm nay + tập phòng
 * hợp lệ cho lead (đã lọc theo hãng lead + có TVBH).
 * - rosterTeamId null (chưa đặt lịch)           → 'unassigned' (giữ chưa phân giao + nhắc Zalo)
 * - rosterTeamId nằm trong teamPool             → 'assign' (ép mọi lead ngày đó về phòng này)
 * - rosterTeamId có nhưng KHÔNG thuộc teamPool  → 'fallback' (phòng trực không bán hãng của
 *                                                 lead / không có TVBH → chia đều như cũ cho lead đó)
 */
export function resolveRosterTeam(
  rosterTeamId: string | null,
  teamPool: string[],
): { mode: RosterMode; teamId?: string } {
  if (!rosterTeamId) return { mode: 'unassigned' };
  if (teamPool.includes(rosterTeamId)) return { mode: 'assign', teamId: rosterTeamId };
  return { mode: 'fallback' };
}
