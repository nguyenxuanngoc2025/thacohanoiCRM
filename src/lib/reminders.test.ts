import { describe, it, expect } from 'vitest';
import { buildOverdueMessages, type OverdueLead } from './reminders';

const now = new Date('2026-06-24T10:00:00Z');

describe('reminders', () => {
  it('gom theo showroom, tính số giờ quá hạn (làm tròn)', () => {
    const leads: OverdueLead[] = [
      { id: '1', showroom_id: 'sr1', showroom_name: 'KIA HN', full_name: 'A', phone: '+8490', assignee_name: 'TV1', next_contact_at: '2026-06-24T05:00:00Z' },
      { id: '2', showroom_id: 'sr1', showroom_name: 'KIA HN', full_name: null, phone: '+8491', assignee_name: null, next_contact_at: '2026-06-24T08:30:00Z' },
      { id: '3', showroom_id: 'sr2', showroom_name: 'Mazda HN', full_name: 'B', phone: '+8492', assignee_name: 'TV2', next_contact_at: '2026-06-24T09:00:00Z' },
    ];
    const out = buildOverdueMessages(leads, now);
    expect(out).toHaveLength(2);
    const sr1 = out.find((o) => o.showroomId === 'sr1')!;
    expect(sr1.leadIds).toEqual(['1', '2']);
    expect(sr1.text).toContain('(2 lead)');
    expect(sr1.text).toContain('quá hạn 5h');
    expect(sr1.text).toContain('Khách lẻ');
    const sr2 = out.find((o) => o.showroomId === 'sr2')!;
    expect(sr2.leadIds).toEqual(['3']);
  });

  it('danh sách rỗng → không có message', () => {
    expect(buildOverdueMessages([], now)).toEqual([]);
  });
});
