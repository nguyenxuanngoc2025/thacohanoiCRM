// Định tuyến thủ công ở trang /assign: lead khớp phòng nào + phòng có trong phạm vi người xem không.
// Thuần (không DB) → test được. Quy tắc khớp phòng mirror ingest.ts cấp 2.

export interface TeamRoute {
  id: string;
  showroom_id: string | null;
  brand_ids: string[];
}

export interface LeadRoute {
  showroom_id: string | null;
  brand_id: string | null;
  sales_team_id: string | null;
}

export interface ScopeLike {
  showroomIds: string[] | null; // null = mọi showroom
  brandIds: string[] | null;    // null = mọi hãng
  teamId: string | null;        // phòng cố định (tp_phong)
}

/**
 * Phòng khớp 1 lead:
 * - Lead đã gắn phòng (sales_team_id) → chỉ đúng phòng đó.
 * - Chưa gắn → phòng cùng showroom (nếu lead có showroom) VÀ bán được hãng của lead.
 *   Lead có brand_id: phòng phải có brand_id trong brand_ids (brand_ids rỗng = chưa gán hãng = KHÔNG nhận).
 *   Lead không brand_id: mọi phòng cùng showroom (kể cả chưa gán hãng).
 */
export function matchTeamsForLead<T extends TeamRoute>(lead: LeadRoute, teams: T[]): T[] {
  if (lead.sales_team_id) return teams.filter((t) => t.id === lead.sales_team_id);
  return teams.filter((t) => {
    if (lead.showroom_id && t.showroom_id !== lead.showroom_id) return false;
    if (lead.brand_id) return t.brand_ids.includes(lead.brand_id);
    return true;
  });
}

/** Phòng có nằm trong phạm vi người xem không (phòng thủ ngoài RLS). */
export function teamInScope(scope: ScopeLike, team: TeamRoute): boolean {
  if (scope.teamId) return team.id === scope.teamId;
  if (scope.showroomIds !== null) return team.showroom_id != null && scope.showroomIds.includes(team.showroom_id);
  if (scope.brandIds !== null) return team.brand_ids.some((b) => scope.brandIds!.includes(b));
  return true;
}
