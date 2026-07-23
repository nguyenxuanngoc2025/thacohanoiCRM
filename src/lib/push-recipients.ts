// Hàm THUẦN (không mạng/DB) quyết định user nào nhận push cho 1 sự kiện lead.
// Nhận dữ liệu đã nạp sẵn để unit-test đủ nhánh vai trò (Mục 5 spec).

export type PushEvent =
  | 'new_lead_assigned'    // lead mới ĐÃ tự giao cho TVBH
  | 'new_lead_unassigned'  // lead mới về phòng nhưng CHƯA giao ai
  | 'new_lead_no_team'     // lead mới về showroom, CHƯA có phòng nhận
  | 'overdue'              // lead quá hạn chăm sóc
  | 'unassigned_backlog'   // lead chưa phân giao còn tồn (nhóm C)
  | 'roster_missing';      // showroom chia theo lịch trực CHƯA đặt lịch ngày kế tiếp

export interface PushUser {
  id: string;
  role: string;
  company_id: string | null;
  sales_team_id: string | null;   // dùng cho tp_phong / tn / tvbh
  showroom_ids: string[];         // dùng cho gd_showroom (từ user_showrooms)
}

export interface PushLeadCtx {
  company_id: string | null;
  sales_team_id: string | null;
  showroom_id: string | null;
  assignee_id: string | null;
}

export function resolvePushRecipients(
  event: PushEvent,
  lead: PushLeadCtx,
  users: PushUser[],
): string[] {
  // Cô lập tenant: chỉ xét user cùng công ty với lead.
  const pool = users.filter((u) => u.company_id === lead.company_id);

  const managersOfTeam = () =>
    lead.sales_team_id == null
      ? []
      : pool.filter((u) => (u.role === 'tp_phong' || u.role === 'tn') && u.sales_team_id === lead.sales_team_id).map((u) => u.id);

  const gdShowroom = () =>
    lead.showroom_id == null
      ? []
      : pool.filter((u) => u.role === 'gd_showroom' && u.showroom_ids.includes(lead.showroom_id!)).map((u) => u.id);

  const assignee = () =>
    lead.assignee_id && pool.some((u) => u.id === lead.assignee_id) ? [lead.assignee_id] : [];

  let ids: string[];
  switch (event) {
    case 'new_lead_assigned':
    case 'overdue':
      ids = [...assignee(), ...managersOfTeam()];
      break;
    case 'new_lead_unassigned':
    case 'unassigned_backlog':
      ids = managersOfTeam();
      break;
    case 'new_lead_no_team':
    case 'roster_missing':
      ids = gdShowroom();
      break;
    default:
      ids = [];
  }
  return [...new Set(ids)];
}
