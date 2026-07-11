import { describe, it, expect } from 'vitest';
import { assertLeadInScope, type CreatorScope } from './lead-scope';

const company: CreatorScope = { kind: 'company', showroomIds: null, brandIds: null, teamId: null };
const brand: CreatorScope = { kind: 'brand', showroomIds: null, brandIds: ['b1', 'b2'], teamId: null };
const showroom: CreatorScope = { kind: 'showroom', showroomIds: ['sr1'], brandIds: null, teamId: null };
const team: CreatorScope = { kind: 'team', showroomIds: ['sr1'], brandIds: ['b1'], teamId: 't1' };

describe('assertLeadInScope', () => {
  it('company không giới hạn — mọi lựa chọn hợp lệ', () => {
    expect(assertLeadInScope(company, { showroomId: 'x', brandId: 'y', salesTeamId: 'z' })).toBeNull();
  });

  it('brand: hãng trong phạm vi hợp lệ, ngoài phạm vi báo lỗi', () => {
    expect(assertLeadInScope(brand, { showroomId: null, brandId: 'b1', salesTeamId: null })).toBeNull();
    expect(assertLeadInScope(brand, { showroomId: null, brandId: 'b9', salesTeamId: null }))
      .toBe('Thương hiệu ngoài phạm vi của bạn.');
  });

  it('showroom: showroom trong phạm vi hợp lệ, ngoài phạm vi báo lỗi', () => {
    expect(assertLeadInScope(showroom, { showroomId: 'sr1', brandId: null, salesTeamId: null })).toBeNull();
    expect(assertLeadInScope(showroom, { showroomId: 'sr9', brandId: null, salesTeamId: null }))
      .toBe('Showroom ngoài phạm vi của bạn.');
  });

  it('team: phòng đúng hợp lệ, phòng khác báo lỗi', () => {
    expect(assertLeadInScope(team, { showroomId: 'sr1', brandId: 'b1', salesTeamId: 't1' })).toBeNull();
    expect(assertLeadInScope(team, { showroomId: 'sr1', brandId: 'b1', salesTeamId: 't9' }))
      .toBe('Phòng ngoài phạm vi của bạn.');
  });

  it('lựa chọn trống (null) không bị chặn', () => {
    expect(assertLeadInScope(brand, { showroomId: null, brandId: null, salesTeamId: null })).toBeNull();
    expect(assertLeadInScope(team, { showroomId: null, brandId: null, salesTeamId: null })).toBeNull();
  });
});
