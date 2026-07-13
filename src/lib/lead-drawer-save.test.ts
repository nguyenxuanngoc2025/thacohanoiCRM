import { describe, it, expect } from 'vitest';
import { planDrawerSave, isDrawerDirty, type DrawerBaseline, type DrawerDraft } from './lead-drawer-save';

const base: DrawerBaseline = {
  source: 'facebook',
  salesTeamId: 't1',
  assignedTo: 'u1',
  status: '',
  modelId: '',
  nextDate: '',
  failReason: '',
};
const draft = (over: Partial<DrawerDraft> = {}): DrawerDraft => ({ ...base, note: '', ...over });

describe('planDrawerSave', () => {
  it('không đổi gì → mọi cờ false, không dirty', () => {
    const p = planDrawerSave(base, draft());
    expect(p).toEqual({ sourceChanged: false, teamChanged: false, assigneeChanged: false, fieldsChanged: false });
    expect(isDrawerDirty(p)).toBe(false);
  });
  it('đổi nguồn → chỉ sourceChanged', () => {
    const p = planDrawerSave(base, draft({ source: 'google_hotline' }));
    expect(p.sourceChanged).toBe(true);
    expect(p.teamChanged || p.assigneeChanged || p.fieldsChanged).toBe(false);
    expect(isDrawerDirty(p)).toBe(true);
  });
  it('đổi phòng → chỉ teamChanged', () => {
    const p = planDrawerSave(base, draft({ salesTeamId: 't2' }));
    expect(p.teamChanged).toBe(true);
    expect(p.sourceChanged || p.assigneeChanged || p.fieldsChanged).toBe(false);
  });
  it('đổi phụ trách → chỉ assigneeChanged', () => {
    const p = planDrawerSave(base, draft({ assignedTo: 'u2' }));
    expect(p.assigneeChanged).toBe(true);
    expect(p.sourceChanged || p.teamChanged || p.fieldsChanged).toBe(false);
  });
  it('đổi phân loại/dòng xe/hẹn gọi/lý do → fieldsChanged', () => {
    expect(planDrawerSave(base, draft({ status: 'GDTD' })).fieldsChanged).toBe(true);
    expect(planDrawerSave(base, draft({ modelId: 'm1' })).fieldsChanged).toBe(true);
    expect(planDrawerSave(base, draft({ nextDate: '2026-07-20' })).fieldsChanged).toBe(true);
    expect(planDrawerSave(base, draft({ failReason: 'Giá cao' })).fieldsChanged).toBe(true);
  });
  it('ghi chú không rỗng → fieldsChanged; chỉ khoảng trắng → không tính', () => {
    expect(planDrawerSave(base, draft({ note: 'đã gọi' })).fieldsChanged).toBe(true);
    expect(planDrawerSave(base, draft({ note: '   ' })).fieldsChanged).toBe(false);
  });
});
