import { describe, it, expect } from 'vitest';
import { buildDailyPushPerUser, type DailyPushUser, type DailyPushLead } from './push-daily';

const now = new Date('2026-07-22T10:00:00Z');
const users: DailyPushUser[] = [
  { id: 'tvbh1', role: 'tvbh', company_id: 'C1', sales_team_id: 'T1', showroom_ids: [] },
  { id: 'tp1',   role: 'tp_phong', company_id: 'C1', sales_team_id: 'T1', showroom_ids: [] },
  { id: 'gdsr1', role: 'gd_showroom', company_id: 'C1', sales_team_id: null, showroom_ids: ['S1'] },
  { id: 'gdcty', role: 'gd_cty', company_id: 'C1', sales_team_id: null, showroom_ids: [] },
];
const leads: DailyPushLead[] = [
  // 2 lead của tvbh1: 1 đã chăm (status set), 1 tồn + quá hạn.
  { company_id: 'C1', sales_team_id: 'T1', showroom_id: 'S1', assignee_id: 'tvbh1', status: 'Đang tư vấn', next_contact_at: null },
  { company_id: 'C1', sales_team_id: 'T1', showroom_id: 'S1', assignee_id: 'tvbh1', status: null, next_contact_at: '2026-07-22T08:00:00Z' },
  // 1 lead phòng T1 chưa giao.
  { company_id: 'C1', sales_team_id: 'T1', showroom_id: 'S1', assignee_id: null, status: null, next_contact_at: null },
];

describe('buildDailyPushPerUser', () => {
  it('sinh bản tin cho TVBH có lead', () => {
    const out = buildDailyPushPerUser(leads, users, now);
    const t = out.find((o) => o.userId === 'tvbh1');
    expect(t).toBeTruthy();
    expect(t!.body).toContain('2'); // 2 lead của tôi
  });

  it('TP phòng nhận tổng hợp phòng (gồm lead chưa giao)', () => {
    const out = buildDailyPushPerUser(leads, users, now);
    const tp = out.find((o) => o.userId === 'tp1');
    expect(tp).toBeTruthy();
    expect(tp!.body).toContain('3'); // tổng 3 lead phòng
  });

  it('GĐ showroom nhận tổng hợp showroom', () => {
    const out = buildDailyPushPerUser(leads, users, now);
    expect(out.find((o) => o.userId === 'gdsr1')).toBeTruthy();
  });

  it('BLĐ công ty nhận tổng công ty', () => {
    const out = buildDailyPushPerUser(leads, users, now);
    expect(out.find((o) => o.userId === 'gdcty')).toBeTruthy();
  });

  it('không rò chéo công ty', () => {
    const out = buildDailyPushPerUser(leads, users.map((u) => ({ ...u, company_id: 'C2' })), now);
    // user thuộc C2, lead thuộc C1 → không ai có số liệu (vẫn có thể tạo tin 0, nhưng không tính lead C1)
    const tp = out.find((o) => o.userId === 'tp1');
    if (tp) expect(tp.body).not.toContain('3');
  });
});
