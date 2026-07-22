// Hàm THUẦN: từ lead trong NGÀY + danh sách user → bản tin push cá nhân theo vai trò (Mục 6 spec).
// Không mạng/DB. Chỉ tạo tin cho user CÓ số liệu liên quan (tránh spam tin rỗng).

export interface DailyPushUser {
  id: string;
  role: string;
  company_id: string | null;
  sales_team_id: string | null;
  showroom_ids: string[];
}

export interface DailyPushLead {
  company_id: string | null;
  sales_team_id: string | null;
  showroom_id: string | null;
  assignee_id: string | null;
  status: string | null;
  next_contact_at: string | null;
}

export interface DailyPushMsg { userId: string; title: string; body: string; url: string }

const isCared = (l: DailyPushLead) => l.status != null;               // đã đổi trạng thái = đã chăm
const isPending = (l: DailyPushLead) => l.status == null;             // chưa xử lý
const isOverdue = (l: DailyPushLead, now: Date) =>
  l.status == null && l.next_contact_at != null && new Date(l.next_contact_at).getTime() <= now.getTime();

export function buildDailyPushPerUser(
  leads: DailyPushLead[],
  users: DailyPushUser[],
  now: Date,
): DailyPushMsg[] {
  const out: DailyPushMsg[] = [];

  for (const u of users) {
    const mine = leads.filter((l) => l.company_id === u.company_id);
    if (u.role === 'tvbh') {
      const own = mine.filter((l) => l.assignee_id === u.id);
      if (own.length === 0) continue;
      const cared = own.filter(isCared).length;
      const pending = own.filter(isPending).length;
      const overdue = own.filter((l) => isOverdue(l, now)).length;
      out.push({
        userId: u.id, title: 'Báo cáo hôm nay',
        body: `${own.length} lead của tôi · ${cared} đã chăm · ${pending} tồn · ${overdue} quá hạn`,
        url: '/leads',
      });
    } else if (u.role === 'tp_phong' || u.role === 'tn') {
      if (!u.sales_team_id) continue;
      const team = mine.filter((l) => l.sales_team_id === u.sales_team_id);
      if (team.length === 0) continue;
      const assigned = team.filter((l) => l.assignee_id != null).length;
      const unassigned = team.length - assigned;
      const overdue = team.filter((l) => isOverdue(l, now)).length;
      out.push({
        userId: u.id, title: 'Báo cáo phòng hôm nay',
        body: `Phòng: ${team.length} lead · ${assigned} đã giao / ${unassigned} chưa giao · ${overdue} quá hạn`,
        url: '/reports',
      });
    } else if (u.role === 'gd_showroom') {
      const sr = mine.filter((l) => l.showroom_id != null && u.showroom_ids.includes(l.showroom_id));
      if (sr.length === 0) continue;
      const cared = sr.filter(isCared).length;
      const pending = sr.filter(isPending).length;
      const rate = sr.length > 0 ? Math.round((cared / sr.length) * 100) : 0;
      out.push({
        userId: u.id, title: 'Báo cáo showroom hôm nay',
        body: `Showroom: ${sr.length} lead · tỷ lệ chăm ${rate}% · ${pending} tồn`,
        url: '/reports',
      });
    } else if (['gd_cty', 'admin', 'mkt_cty', 'digital_mkt', 'gd_brand', 'tp_brand', 'mkt_brand'].includes(u.role)) {
      // BLĐ hãng/công ty: số tổng, không đi sâu. (Hãng: lọc theo lead công ty — chi tiết brand để Zalo.)
      if (mine.length === 0) continue;
      const cared = mine.filter(isCared).length;
      out.push({
        userId: u.id, title: 'Tổng hợp hôm nay',
        body: `${mine.length} lead toàn công ty · ${cared} đã chăm`,
        url: '/reports',
      });
    }
  }
  return out;
}
