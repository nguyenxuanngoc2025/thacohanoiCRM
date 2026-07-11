import { describe, it, expect } from 'vitest';
import { vnDateStr, resolveRosterTeam } from './roster';

describe('vnDateStr', () => {
  it('quy về ngày giờ VN (UTC+7)', () => {
    // 2026-07-11T17:30:00Z = 00:30 ngày 12/07 giờ VN → phải trả 2026-07-12
    expect(vnDateStr(new Date('2026-07-11T17:30:00Z'))).toBe('2026-07-12');
    // 2026-07-11T10:00:00Z = 17:00 ngày 11/07 giờ VN
    expect(vnDateStr(new Date('2026-07-11T10:00:00Z'))).toBe('2026-07-11');
  });
});

describe('resolveRosterTeam', () => {
  it('chưa đặt lịch (null) → unassigned', () => {
    expect(resolveRosterTeam(null, ['a', 'b'])).toEqual({ mode: 'unassigned' });
  });
  it('phòng trực thuộc tập hợp lệ → assign đúng phòng', () => {
    expect(resolveRosterTeam('b', ['a', 'b'])).toEqual({ mode: 'assign', teamId: 'b' });
  });
  it('phòng trực không bán hãng/không có TVBH (ngoài pool) → fallback', () => {
    expect(resolveRosterTeam('z', ['a', 'b'])).toEqual({ mode: 'fallback' });
  });
});
