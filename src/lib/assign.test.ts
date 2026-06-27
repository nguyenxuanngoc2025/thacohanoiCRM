import { describe, it, expect } from 'vitest';
import { pickNextAssignee, pickRoundRobin, pickByStrategy, type StrategyCandidate } from './assign';

describe('pickNextAssignee', () => {
  it('chon TVBH co it lead nhat', () => {
    const list = [
      { id: 'a', activeLeadCount: 5 },
      { id: 'b', activeLeadCount: 2 },
      { id: 'c', activeLeadCount: 8 },
    ];
    expect(pickNextAssignee(list)).toBe('b');
  });
  it('hoa so lead → chon id nho nhat (on dinh)', () => {
    const list = [
      { id: 'z', activeLeadCount: 3 },
      { id: 'a', activeLeadCount: 3 },
    ];
    expect(pickNextAssignee(list)).toBe('a');
  });
  it('danh sach rong → null', () => {
    expect(pickNextAssignee([])).toBeNull();
  });
});

describe('pickRoundRobin', () => {
  it('ưu tiên nơi CHƯA từng nhận lead (lastAssignedAt null)', () => {
    expect(pickRoundRobin([
      { id: 'a', lastAssignedAt: 100 },
      { id: 'b', lastAssignedAt: null },
    ])).toBe('b');
  });
  it('chọn nơi nhận lead lâu nhất (lastAssignedAt nhỏ nhất)', () => {
    expect(pickRoundRobin([
      { id: 'a', lastAssignedAt: 300 },
      { id: 'b', lastAssignedAt: 100 },
      { id: 'c', lastAssignedAt: 200 },
    ])).toBe('b');
  });
  it('rỗng → null; hòa → id nhỏ nhất', () => {
    expect(pickRoundRobin([])).toBeNull();
    expect(pickRoundRobin([{ id: 'y', lastAssignedAt: null }, { id: 'x', lastAssignedAt: null }])).toBe('x');
  });
});

describe('pickByStrategy', () => {
  const cands: StrategyCandidate[] = [
    { id: 'a', activeLeadCount: 5, sharePct: 70, lastAssignedAt: 100 },
    { id: 'b', activeLeadCount: 1, sharePct: 30, lastAssignedAt: 200 },
  ];
  it('least_loaded → nơi ít lead nhất', () => {
    expect(pickByStrategy('least_loaded', cands)).toBe('b');
  });
  it('round_robin → nơi nhận lâu nhất', () => {
    expect(pickByStrategy('round_robin', cands)).toBe('a');
  });
  it('weighted → theo % thâm hụt', () => {
    expect(pickByStrategy('weighted', cands)).toBe('b');
  });
  it('rỗng → null', () => {
    expect(pickByStrategy('least_loaded', [])).toBeNull();
  });
});
