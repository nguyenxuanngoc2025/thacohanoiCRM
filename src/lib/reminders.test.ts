import { describe, it, expect } from 'vitest';
import { buildOverdueMessages, type OverdueLead } from './reminders';

const now = new Date('2026-06-24T10:00:00Z');

describe('reminders', () => {
  it('gom theo phòng bán hàng, tính số giờ quá hạn (làm tròn)', () => {
    const leads: OverdueLead[] = [
      { id: '1', sales_team_id: 't1', team_name: 'Phòng KIA 1', full_name: 'A', phone: '+8490', assignee_name: 'TV1', next_contact_at: '2026-06-24T05:00:00Z' },
      { id: '2', sales_team_id: 't1', team_name: 'Phòng KIA 1', full_name: null, phone: '+8491', assignee_name: null, next_contact_at: '2026-06-24T08:30:00Z' },
      { id: '3', sales_team_id: 't2', team_name: 'Phòng Mazda 1', full_name: 'B', phone: '+8492', assignee_name: 'TV2', next_contact_at: '2026-06-24T09:00:00Z' },
    ];
    const out = buildOverdueMessages(leads, now);
    expect(out).toHaveLength(2);
    const t1 = out.find((o) => o.teamId === 't1')!;
    expect(t1.leadIds).toEqual(['1', '2']);
    expect(t1.teamName).toBe('Phòng KIA 1');
    expect(t1.text).toContain('Tổng <b>2</b> lead');
    expect(t1.text).toContain('Quá hạn lâu nhất: 5h');
    expect(t1.text).toContain('Khách lẻ');
    expect(t1.text).toContain('Phòng KIA 1');
    const t2 = out.find((o) => o.teamId === 't2')!;
    expect(t2.leadIds).toEqual(['3']);
  });

  it('lead không thuộc phòng nào (sales_team_id null) → bỏ qua', () => {
    const leads: OverdueLead[] = [
      { id: '1', sales_team_id: null, team_name: null, full_name: 'A', phone: '+8490', assignee_name: null, next_contact_at: '2026-06-24T05:00:00Z' },
    ];
    expect(buildOverdueMessages(leads, now)).toEqual([]);
  });

  it('danh sách rỗng → không có message', () => {
    expect(buildOverdueMessages([], now)).toEqual([]);
  });
});
