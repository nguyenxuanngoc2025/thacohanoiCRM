import { describe, it, expect } from 'vitest';
import { buildOverdueMessages, buildCallbackMessages, buildUnassignedMessages, type OverdueLead, type CallbackLead, type UnassignedLead } from './reminders';

describe('buildUnassignedMessages', () => {
  const nowC = new Date('2026-07-22T10:00:00Z');
  it('gom theo phòng → 1 tin mỗi phòng, đúng leadIds', () => {
    const leads: UnassignedLead[] = [
      { id: 'a', sales_team_id: 't1', team_name: 'Phòng 1', full_name: 'X', phone: '0900000001', created_at: '2026-07-22T08:00:00Z' },
      { id: 'b', sales_team_id: 't1', team_name: 'Phòng 1', full_name: null, phone: '0900000002', created_at: '2026-07-22T07:00:00Z' },
      { id: 'c', sales_team_id: 't2', team_name: 'Phòng 2', full_name: 'Y', phone: '0900000003', created_at: '2026-07-22T09:00:00Z' },
    ];
    const msgs = buildUnassignedMessages(leads, nowC);
    expect(msgs).toHaveLength(2);
    const m1 = msgs.find((m) => m.teamId === 't1')!;
    expect(m1.leadIds.sort()).toEqual(['a', 'b']);
    expect(m1.text).toContain('Phòng 1');
    expect(m1.text).toContain('<b>2</b>');
  });

  it('lead không có phòng → bỏ qua', () => {
    const leads: UnassignedLead[] = [
      { id: 'a', sales_team_id: null, team_name: null, full_name: 'X', phone: '0900000001', created_at: '2026-07-22T08:00:00Z' },
    ];
    expect(buildUnassignedMessages(leads, nowC)).toHaveLength(0);
  });
});

const now = new Date('2026-06-24T10:00:00Z');

describe('reminders', () => {
  it('gom theo phòng, tính thời gian chờ TỪ LÚC GIAO (cộng SLA first_response), định dạng giờ+phút', () => {
    const leads: OverdueLead[] = [
      // giao = 05:00 (hạn 05:00 vì fr=0), nay 10:00 → chờ 5 giờ
      { id: '1', sales_team_id: 't1', team_name: 'Phòng KIA 1', full_name: 'A', phone: '+8490', assignee_name: 'TV1', next_contact_at: '2026-06-24T05:00:00Z', first_response_hours: 0 },
      // hạn 08:30, fr=1 → giao 07:30, nay 10:00 → chờ 2 giờ 30 phút
      { id: '2', sales_team_id: 't1', team_name: 'Phòng KIA 1', full_name: null, phone: '+8491', assignee_name: null, next_contact_at: '2026-06-24T08:30:00Z', first_response_hours: 1 },
      { id: '3', sales_team_id: 't2', team_name: 'Phòng Mazda 1', full_name: 'B', phone: '+8492', assignee_name: 'TV2', next_contact_at: '2026-06-24T09:00:00Z', first_response_hours: 2 },
    ];
    const out = buildOverdueMessages(leads, now);
    expect(out).toHaveLength(2);
    const t1 = out.find((o) => o.teamId === 't1')!;
    expect(t1.leadIds).toEqual(['1', '2']);
    expect(t1.teamName).toBe('Phòng KIA 1');
    expect(t1.text).toContain('Tổng <b>2</b> Lead');
    expect(t1.text).toContain('Quá hạn lâu nhất: 5 giờ'); // max = lead1 (5 giờ)
    expect(t1.text).toContain('2 giờ 30 phút');            // lead2
    expect(t1.text).not.toContain('0 giờ');
    expect(t1.text).toContain('Khách lẻ');
    expect(t1.text).toContain('Phòng KIA 1');
    const t2 = out.find((o) => o.teamId === 't2')!;
    expect(t2.leadIds).toEqual(['3']);
  });

  it('vừa tới hạn (fr=1, chưa quá giây nào) vẫn hiện "1 giờ" chứ KHÔNG phải "0 giờ"', () => {
    const leads: OverdueLead[] = [
      { id: '1', sales_team_id: 't1', team_name: 'P', full_name: 'A', phone: '+8490', assignee_name: 'TV', next_contact_at: '2026-06-24T10:00:00Z', first_response_hours: 1 },
    ];
    const t = buildOverdueMessages(leads, now)[0].text;
    expect(t).toContain('1 giờ');
    expect(t).not.toContain('0 giờ');
  });

  it('dưới 1 giờ chờ → hiện theo phút (fr=0, quá hạn 20 phút)', () => {
    const leads: OverdueLead[] = [
      { id: '1', sales_team_id: 't1', team_name: 'P', full_name: 'A', phone: '+8490', assignee_name: 'TV', next_contact_at: '2026-06-24T09:40:00Z', first_response_hours: 0 },
    ];
    const t = buildOverdueMessages(leads, now)[0].text;
    expect(t).toContain('20 phút');
  });

  it('lead không thuộc phòng nào (sales_team_id null) → bỏ qua', () => {
    const leads: OverdueLead[] = [
      { id: '1', sales_team_id: null, team_name: null, full_name: 'A', phone: '+8490', assignee_name: null, next_contact_at: '2026-06-24T05:00:00Z', first_response_hours: 0 },
    ];
    expect(buildOverdueMessages(leads, now)).toEqual([]);
  });

  it('danh sách rỗng → không có message', () => {
    expect(buildOverdueMessages([], now)).toEqual([]);
  });
});

describe('buildCallbackMessages', () => {
  it('gom theo phòng, nêu số lần gọi hụt', () => {
    const leads: CallbackLead[] = [
      { id: '1', sales_team_id: 't1', team_name: 'Phòng KIA 1', full_name: 'A', phone: '+8490', assignee_name: 'TV1', no_answer_count: 1 },
      { id: '2', sales_team_id: 't1', team_name: 'Phòng KIA 1', full_name: null, phone: '+8491', assignee_name: 'TV1', no_answer_count: 2 },
      { id: '3', sales_team_id: 't2', team_name: 'Phòng Mazda 1', full_name: 'B', phone: '+8492', assignee_name: 'TV2', no_answer_count: 1 },
    ];
    const out = buildCallbackMessages(leads);
    expect(out).toHaveLength(2);
    const t1 = out.find((o) => o.teamId === 't1')!;
    expect(t1.leadIds).toEqual(['1', '2']);
    expect(t1.text).toContain('CẦN GỌI LẠI');
    expect(t1.text).toContain('<b>2</b> khách');
    expect(t1.text).toContain('đã gọi 2 lần');
  });

  it('lead không thuộc phòng nào → bỏ qua; rỗng → không message', () => {
    expect(buildCallbackMessages([{ id: '1', sales_team_id: null, team_name: null, full_name: 'A', phone: '+8490', assignee_name: null, no_answer_count: 1 }])).toEqual([]);
    expect(buildCallbackMessages([])).toEqual([]);
  });
});
