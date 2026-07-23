import { describe, it, expect } from 'vitest';
import { resolvePushRecipients, type PushUser, type PushLeadCtx } from './push-recipients';

const users: PushUser[] = [
  { id: 'tvbh1', role: 'tvbh', company_id: 'C1', sales_team_id: 'T1', showroom_ids: [] },
  { id: 'tp1',   role: 'tp_phong', company_id: 'C1', sales_team_id: 'T1', showroom_ids: [] },
  { id: 'tn1',   role: 'tn', company_id: 'C1', sales_team_id: 'T1', showroom_ids: [] },
  { id: 'tpX',   role: 'tp_phong', company_id: 'C1', sales_team_id: 'T2', showroom_ids: [] },
  { id: 'gdsr1', role: 'gd_showroom', company_id: 'C1', sales_team_id: null, showroom_ids: ['S1'] },
  { id: 'gdsrX', role: 'gd_showroom', company_id: 'C1', sales_team_id: null, showroom_ids: ['S9'] },
  { id: 'other', role: 'tp_phong', company_id: 'C2', sales_team_id: 'T1', showroom_ids: [] }, // khác công ty
];
const lead: PushLeadCtx = { company_id: 'C1', sales_team_id: 'T1', showroom_id: 'S1', assignee_id: 'tvbh1' };

describe('resolvePushRecipients', () => {
  it('lead mới đã tự giao → TVBH + TP/TN phụ trách phòng', () => {
    const r = resolvePushRecipients('new_lead_assigned', lead, users).sort();
    expect(r).toEqual(['tn1', 'tp1', 'tvbh1']);
  });

  it('lead mới về phòng chưa giao ai → chỉ TP/TN phụ trách phòng', () => {
    const r = resolvePushRecipients('new_lead_unassigned', { ...lead, assignee_id: null }, users).sort();
    expect(r).toEqual(['tn1', 'tp1']);
  });

  it('lead mới về showroom chưa có phòng nhận → GĐ showroom', () => {
    const r = resolvePushRecipients('new_lead_no_team', { ...lead, sales_team_id: null, assignee_id: null }, users);
    expect(r).toEqual(['gdsr1']);
  });

  it('showroom chưa đặt lịch trực ngày kế tiếp → GĐ showroom', () => {
    const r = resolvePushRecipients('roster_missing', { ...lead, sales_team_id: null, assignee_id: null }, users);
    expect(r).toEqual(['gdsr1']);
  });

  it('quá hạn chăm sóc → TVBH + TP/TN', () => {
    const r = resolvePushRecipients('overdue', lead, users).sort();
    expect(r).toEqual(['tn1', 'tp1', 'tvbh1']);
  });

  it('tồn chưa phân giao (nhóm C) → TP/TN phụ trách phòng', () => {
    const r = resolvePushRecipients('unassigned_backlog', { ...lead, assignee_id: null }, users).sort();
    expect(r).toEqual(['tn1', 'tp1']);
  });

  it('không rò chéo công ty (user C2 không nhận lead C1)', () => {
    const r = resolvePushRecipients('new_lead_unassigned', { ...lead, assignee_id: null }, users);
    expect(r).not.toContain('other');
  });

  it('không trùng người nhận', () => {
    const dup = [...users, { id: 'tvbh1', role: 'tp_phong', company_id: 'C1', sales_team_id: 'T1', showroom_ids: [] } as PushUser];
    const r = resolvePushRecipients('new_lead_assigned', lead, dup).filter((x) => x === 'tvbh1');
    expect(r.length).toBe(1);
  });
});
