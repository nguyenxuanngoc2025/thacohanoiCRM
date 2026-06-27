import { describe, it, expect } from 'vitest';
import { pickByStrategy, type AssignStrategy, type StrategyCandidate } from './assign';

/**
 * E2E cây phân giao 3 cấp — mô phỏng nguyên văn logic quyết định của ingest.ts
 * (công ty → showroom → phòng → TVBH) trên dữ liệu in-memory, không chạm DB.
 * Mục tiêu: chứng minh định tuyến đa cấp + override TVBH cố định hoạt động đúng.
 */

interface Tvbh {
  id: string;
  activeLeadCount: number;
  sharePct: number;
  lastAssignedAt: number | null;
  isActive: boolean;
}
interface Team {
  id: string;
  strategy: AssignStrategy; // tvbh_assign_strategy (cấp 3)
  sharePct: number;
  activeLeadCount: number;
  lastAssignedAt: number | null;
  tvbh: Tvbh[];
}
interface Showroom {
  id: string;
  strategy: AssignStrategy; // team_assign_strategy (cấp 2)
  sharePct: number;
  activeLeadCount: number;
  lastAssignedAt: number | null;
  teams: Team[];
}
interface SpecificRule {
  showroomId: string | null; // null = mặc định toàn công ty
  specificUserId: string;
  priority: number;
}
interface Company {
  strategy: AssignStrategy; // showroom_assign_strategy (cấp 1)
  showrooms: Showroom[];
  rules?: SpecificRule[];
}

interface CascadeResult {
  showroomId: string | null;
  teamId: string | null;
  tvbhId: string | null;
}

/** Một TVBH active = đếm được trong cấp 3. */
const teamHasTvbh = (t: Team) => t.tvbh.some((u) => u.isActive);
const showroomHasTvbh = (s: Showroom) => s.teams.some(teamHasTvbh);

function cascade(co: Company): CascadeResult {
  // CẤP 1 — chọn showroom theo chiến lược công ty.
  const all = co.showrooms;
  const withTvbh = all.filter(showroomHasTvbh);
  const pool = withTvbh.length > 0 ? withTvbh : all;
  const srCands: StrategyCandidate[] = pool.map((s) => ({
    id: s.id, activeLeadCount: s.activeLeadCount, sharePct: s.sharePct, lastAssignedAt: s.lastAssignedAt,
  }));
  const chosenShowroomId = pickByStrategy(co.strategy, srCands) ?? (all[0]?.id ?? null);
  const showroom = all.find((s) => s.id === chosenShowroomId) ?? null;
  if (!showroom) return { showroomId: null, teamId: null, tvbhId: null };

  // Luật phân giao: rule showroom (priority cao) > rule mặc định toàn công ty.
  const applicable = (co.rules ?? [])
    .filter((r) => r.showroomId === chosenShowroomId || r.showroomId === null)
    .sort((a, b) =>
      b.priority !== a.priority ? b.priority - a.priority : (b.showroomId ? 1 : 0) - (a.showroomId ? 1 : 0)
    );
  const rule = applicable[0];
  if (rule) {
    // Override: TVBH cố định → suy ra phòng chứa TVBH đó.
    const team = showroom.teams.find((t) => t.tvbh.some((u) => u.id === rule.specificUserId)) ?? null;
    return { showroomId: chosenShowroomId, teamId: team?.id ?? null, tvbhId: rule.specificUserId };
  }

  // CẤP 2 — chọn phòng trong showroom theo chiến lược showroom.
  const teamsWithTvbh = showroom.teams.filter(teamHasTvbh);
  const teamPool = teamsWithTvbh.length > 0 ? teamsWithTvbh : showroom.teams;
  const teamCands: StrategyCandidate[] = teamPool.map((t) => ({
    id: t.id, activeLeadCount: t.activeLeadCount, sharePct: t.sharePct, lastAssignedAt: t.lastAssignedAt,
  }));
  const chosenTeamId = teamPool.length > 0 ? pickByStrategy(showroom.strategy, teamCands) : null;
  const team = showroom.teams.find((t) => t.id === chosenTeamId) ?? null;
  if (!team) return { showroomId: chosenShowroomId, teamId: null, tvbhId: null };

  // CẤP 3 — chọn TVBH trong phòng theo chiến lược phòng.
  const tvbhActive = team.tvbh.filter((u) => u.isActive);
  const tvbhCands: StrategyCandidate[] = tvbhActive.map((u) => ({
    id: u.id, activeLeadCount: u.activeLeadCount, sharePct: u.sharePct, lastAssignedAt: u.lastAssignedAt,
  }));
  const tvbhId = tvbhActive.length > 0 ? pickByStrategy(team.strategy, tvbhCands) : null;
  return { showroomId: chosenShowroomId, teamId: chosenTeamId, tvbhId };
}

// Tiện ích dựng node nhanh.
const tvbh = (id: string, leads: number, pct = 0, last: number | null = null, isActive = true): Tvbh =>
  ({ id, activeLeadCount: leads, sharePct: pct, lastAssignedAt: last, isActive });

describe('E2E cascade — định tuyến 3 cấp đầy đủ', () => {
  it('least_loaded mọi cấp: đi tới showroom/phòng/TVBH ít lead nhất', () => {
    const co: Company = {
      strategy: 'least_loaded',
      showrooms: [
        { id: 'sr1', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 10, lastAssignedAt: null,
          teams: [{ id: 't1', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
            tvbh: [tvbh('u1', 0)] }] },
        { id: 'sr2', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 2, lastAssignedAt: null,
          teams: [
            { id: 't2', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 5, lastAssignedAt: null,
              tvbh: [tvbh('u2', 5)] },
            { id: 't3', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 1, lastAssignedAt: null,
              tvbh: [tvbh('u3', 9), tvbh('u4', 1)] },
          ] },
      ],
    };
    expect(cascade(co)).toEqual({ showroomId: 'sr2', teamId: 't3', tvbhId: 'u4' });
  });

  it('round_robin mọi cấp: đi tới nơi nhận lead lâu nhất / chưa từng nhận', () => {
    const co: Company = {
      strategy: 'round_robin',
      showrooms: [
        { id: 'sr1', strategy: 'round_robin', sharePct: 0, activeLeadCount: 0, lastAssignedAt: 500,
          teams: [{ id: 't1', strategy: 'round_robin', sharePct: 0, activeLeadCount: 0, lastAssignedAt: 9,
            tvbh: [tvbh('u1', 0, 0, 9)] }] },
        { id: 'sr2', strategy: 'round_robin', sharePct: 0, activeLeadCount: 0, lastAssignedAt: 100,
          teams: [
            { id: 't2', strategy: 'round_robin', sharePct: 0, activeLeadCount: 0, lastAssignedAt: 300,
              tvbh: [tvbh('u2', 0, 0, 300)] },
            { id: 't3', strategy: 'round_robin', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
              tvbh: [tvbh('u3', 0, 0, 50), tvbh('u4', 0, 0, null)] },
          ] },
      ],
    };
    // sr2 (last=100 < 500) → t3 (last null ưu tiên) → u4 (null ưu tiên).
    expect(cascade(co)).toEqual({ showroomId: 'sr2', teamId: 't3', tvbhId: 'u4' });
  });

  it('weighted mọi cấp: đi tới nơi thâm hụt % lớn nhất', () => {
    const co: Company = {
      strategy: 'weighted',
      showrooms: [
        // sr1 share 70% nhưng đang giữ 9/10 lead (90%) → thâm hụt âm. sr2 share 30% giữ 1/10 (10%) → thâm hụt +20%.
        { id: 'sr1', strategy: 'weighted', sharePct: 70, activeLeadCount: 9, lastAssignedAt: null,
          teams: [{ id: 't1', strategy: 'weighted', sharePct: 100, activeLeadCount: 0, lastAssignedAt: null,
            tvbh: [tvbh('u1', 0, 100)] }] },
        { id: 'sr2', strategy: 'weighted', sharePct: 30, activeLeadCount: 1, lastAssignedAt: null,
          teams: [
            // t2 share 80% giữ 4/5 (80%) → thâm hụt 0. t3 share 20% giữ 1/5 (20%) → thâm hụt 0. hòa → id nhỏ = t2.
            { id: 't2', strategy: 'weighted', sharePct: 80, activeLeadCount: 4, lastAssignedAt: null,
              tvbh: [tvbh('ua', 4, 50), tvbh('ub', 0, 50)] },
            { id: 't3', strategy: 'weighted', sharePct: 20, activeLeadCount: 1, lastAssignedAt: null,
              tvbh: [tvbh('uc', 1, 100)] },
          ] },
      ],
    };
    // cấp1: sr2 thắng. cấp2: t2 (hòa thâm hụt, id nhỏ). cấp3: ub share 50% giữ 0/4 → thâm hụt lớn nhất.
    expect(cascade(co)).toEqual({ showroomId: 'sr2', teamId: 't2', tvbhId: 'ub' });
  });

  it('mỗi cấp một chiến lược khác nhau (tích hợp hỗn hợp)', () => {
    const co: Company = {
      strategy: 'weighted', // cấp 1 weighted
      showrooms: [
        { id: 'sr1', strategy: 'round_robin', sharePct: 30, activeLeadCount: 5, lastAssignedAt: null,
          teams: [{ id: 't1', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
            tvbh: [tvbh('u1', 3)] }] },
        // sr2 share 70% giữ 5/10 (50%) → thâm hụt +20% > sr1 (30% giữ 5/10=50% → -20%). sr2 thắng.
        { id: 'sr2', strategy: 'round_robin', sharePct: 70, activeLeadCount: 5, lastAssignedAt: null,
          teams: [
            { id: 't2', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: 200,
              tvbh: [tvbh('u2', 8), tvbh('u3', 2)] },
            { id: 't3', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: 100,
              tvbh: [tvbh('u4', 7)] },
          ] },
      ],
    };
    // cấp1 weighted → sr2. cấp2 round_robin → t3 (last 100 < 200). cấp3 least_loaded → u4 (chỉ có u4).
    expect(cascade(co)).toEqual({ showroomId: 'sr2', teamId: 't3', tvbhId: 'u4' });
  });

  it('override TVBH cố định (rule showroom) thắng cascade, suy ra đúng phòng', () => {
    const co: Company = {
      strategy: 'least_loaded',
      rules: [{ showroomId: 'sr1', specificUserId: 'u3', priority: 10 }],
      showrooms: [
        { id: 'sr1', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
          teams: [
            { id: 't1', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
              tvbh: [tvbh('u1', 0)] },
            { id: 't2', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
              tvbh: [tvbh('u3', 99)] }, // u3 nhiều lead nhất nhưng vẫn được ghim
          ] },
        { id: 'sr2', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 99, lastAssignedAt: null,
          teams: [{ id: 't3', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
            tvbh: [tvbh('u4', 0)] }] },
      ],
    };
    // cấp1 least_loaded → sr1 (0 < 99). rule ghim u3 → phòng t2.
    expect(cascade(co)).toEqual({ showroomId: 'sr1', teamId: 't2', tvbhId: 'u3' });
  });

  it('rule mặc định toàn công ty (showroomId null) áp dụng khi không có rule showroom', () => {
    const co: Company = {
      strategy: 'least_loaded',
      rules: [{ showroomId: null, specificUserId: 'u1', priority: 0 }],
      showrooms: [
        { id: 'sr1', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
          teams: [{ id: 't1', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
            tvbh: [tvbh('u1', 50)] }] },
      ],
    };
    expect(cascade(co)).toEqual({ showroomId: 'sr1', teamId: 't1', tvbhId: 'u1' });
  });

  it('rule showroom thắng rule mặc định khi cả hai cùng áp dụng', () => {
    const co: Company = {
      strategy: 'least_loaded',
      rules: [
        { showroomId: null, specificUserId: 'u1', priority: 5 },
        { showroomId: 'sr1', specificUserId: 'u2', priority: 5 }, // cùng priority → rule showroom ưu tiên
      ],
      showrooms: [
        { id: 'sr1', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
          teams: [{ id: 't1', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
            tvbh: [tvbh('u1', 0), tvbh('u2', 0)] }] },
      ],
    };
    expect(cascade(co).tvbhId).toBe('u2');
  });

  it('bỏ qua showroom KHÔNG có TVBH active ở cấp 1', () => {
    const co: Company = {
      strategy: 'least_loaded',
      showrooms: [
        // sr1 ít lead nhất NHƯNG không có TVBH active → bị loại khỏi pool.
        { id: 'sr1', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
          teams: [{ id: 't1', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
            tvbh: [tvbh('u1', 0, 0, null, false)] }] },
        { id: 'sr2', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 5, lastAssignedAt: null,
          teams: [{ id: 't2', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
            tvbh: [tvbh('u2', 0)] }] },
      ],
    };
    expect(cascade(co)).toEqual({ showroomId: 'sr2', teamId: 't2', tvbhId: 'u2' });
  });

  it('bỏ qua phòng KHÔNG có TVBH active ở cấp 2', () => {
    const co: Company = {
      strategy: 'least_loaded',
      showrooms: [
        { id: 'sr1', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
          teams: [
            // t1 ít lead nhất nhưng TVBH inactive → loại.
            { id: 't1', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 0, lastAssignedAt: null,
              tvbh: [tvbh('u1', 0, 0, null, false)] },
            { id: 't2', strategy: 'least_loaded', sharePct: 0, activeLeadCount: 3, lastAssignedAt: null,
              tvbh: [tvbh('u2', 1)] },
          ] },
      ],
    };
    expect(cascade(co)).toEqual({ showroomId: 'sr1', teamId: 't2', tvbhId: 'u2' });
  });
});
