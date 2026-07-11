import { describe, it, expect } from 'vitest';
import { matchTeamsForLead, teamInScope, type TeamRoute, type LeadRoute, type ScopeLike } from './assign-routing';

const teams: (TeamRoute & { name: string })[] = [
  { id: 't1', showroom_id: 's1', brand_ids: ['kia'], name: 'Phòng A' },
  { id: 't2', showroom_id: 's1', brand_ids: ['kia', 'mazda'], name: 'Phòng B' },
  { id: 't3', showroom_id: 's2', brand_ids: ['mazda'], name: 'Phòng C' },
  { id: 't4', showroom_id: 's1', brand_ids: [], name: 'Phòng chưa gán hãng' },
];

describe('matchTeamsForLead', () => {
  it('lead đã gắn phòng → chỉ đúng phòng đó', () => {
    const lead: LeadRoute = { showroom_id: 's1', brand_id: 'kia', sales_team_id: 't2' };
    expect(matchTeamsForLead(lead, teams).map((t) => t.id)).toEqual(['t2']);
  });

  it('lead chưa gắn phòng → khớp phòng cùng showroom + có bán hãng đó', () => {
    const lead: LeadRoute = { showroom_id: 's1', brand_id: 'kia', sales_team_id: null };
    expect(matchTeamsForLead(lead, teams).map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('phòng brand_ids rỗng KHÔNG khớp (chưa gán hãng = không nhận)', () => {
    const lead: LeadRoute = { showroom_id: 's1', brand_id: 'mazda', sales_team_id: null };
    expect(matchTeamsForLead(lead, teams).map((t) => t.id)).toEqual(['t2']);
  });

  it('lead không có showroom → bỏ lọc showroom, vẫn lọc hãng', () => {
    const lead: LeadRoute = { showroom_id: null, brand_id: 'mazda', sales_team_id: null };
    expect(matchTeamsForLead(lead, teams).map((t) => t.id)).toEqual(['t2', 't3']);
  });

  it('lead không hãng + không phòng → mọi phòng cùng showroom (kể cả chưa gán hãng)', () => {
    const lead: LeadRoute = { showroom_id: 's1', brand_id: null, sales_team_id: null };
    expect(matchTeamsForLead(lead, teams).map((t) => t.id)).toEqual(['t1', 't2', 't4']);
  });

  it('lead gắn phòng không tồn tại trong danh sách → rỗng', () => {
    const lead: LeadRoute = { showroom_id: 's1', brand_id: 'kia', sales_team_id: 'tX' };
    expect(matchTeamsForLead(lead, teams)).toEqual([]);
  });
});

describe('teamInScope', () => {
  const team: TeamRoute = { id: 't1', showroom_id: 's1', brand_ids: ['kia'] };

  it('company (mọi null) → luôn true', () => {
    const scope: ScopeLike = { showroomIds: null, brandIds: null, teamId: null };
    expect(teamInScope(scope, team)).toBe(true);
  });

  it('team cố định → chỉ đúng phòng đó', () => {
    expect(teamInScope({ showroomIds: null, brandIds: null, teamId: 't1' }, team)).toBe(true);
    expect(teamInScope({ showroomIds: null, brandIds: null, teamId: 't9' }, team)).toBe(false);
  });

  it('showroom scope → theo showroom của phòng', () => {
    expect(teamInScope({ showroomIds: ['s1'], brandIds: null, teamId: null }, team)).toBe(true);
    expect(teamInScope({ showroomIds: ['s2'], brandIds: null, teamId: null }, team)).toBe(false);
  });

  it('brand scope → phòng phải bán ít nhất 1 hãng trong phạm vi', () => {
    expect(teamInScope({ showroomIds: null, brandIds: ['kia'], teamId: null }, team)).toBe(true);
    expect(teamInScope({ showroomIds: null, brandIds: ['mazda'], teamId: null }, team)).toBe(false);
  });
});
