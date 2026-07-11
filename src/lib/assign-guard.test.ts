import { describe, it, expect } from 'vitest';
import { showroomInScope, type AssignManagerContext } from './assign-guard';

const base = { service: {} as never, userId: 'u1', companyId: 'c1' };

describe('showroomInScope', () => {
  it('admin (showroomIds=null) luôn trong phạm vi', () => {
    const ctx: AssignManagerContext = { ...base, role: 'admin', showroomIds: null };
    expect(showroomInScope(ctx, 'sr-any')).toBe(true);
    expect(showroomInScope(ctx, null)).toBe(true);
  });

  it('gd_showroom chỉ trong phạm vi showroom phụ trách', () => {
    const ctx: AssignManagerContext = { ...base, role: 'gd_showroom', showroomIds: ['sr-1', 'sr-2'] };
    expect(showroomInScope(ctx, 'sr-1')).toBe(true);
    expect(showroomInScope(ctx, 'sr-2')).toBe(true);
    expect(showroomInScope(ctx, 'sr-3')).toBe(false);
  });

  it('gd_showroom showroom null/undefined → ngoài phạm vi', () => {
    const ctx: AssignManagerContext = { ...base, role: 'gd_showroom', showroomIds: ['sr-1'] };
    expect(showroomInScope(ctx, null)).toBe(false);
    expect(showroomInScope(ctx, undefined)).toBe(false);
  });

  it('gd_showroom không phụ trách showroom nào → chặn hết', () => {
    const ctx: AssignManagerContext = { ...base, role: 'gd_showroom', showroomIds: [] };
    expect(showroomInScope(ctx, 'sr-1')).toBe(false);
  });
});
