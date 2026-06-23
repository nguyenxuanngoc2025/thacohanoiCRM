import { describe, it, expect } from 'vitest';
import { pickNextAssignee } from './assign';

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
