import { describe, it, expect } from 'vitest';
import {
  ALL_ROLES, CREATABLE_ROLES, isCreatableRole, ROLE_SCOPE_KIND,
  CAN_VIEW_REPORTS, CAN_ASSIGN,
  ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_SCOPE, ROLE_CAN, ROLE_CANNOT, ROLE_NEEDS, ROLE_COLOR,
} from './nav';

describe('danh mục vai trò', () => {
  it('có đúng 13 vai trò, gồm digital_mkt + tn, không còn tp_showroom', () => {
    expect(ALL_ROLES).toHaveLength(13);
    expect(ALL_ROLES).toContain('digital_mkt');
    expect(ALL_ROLES).toContain('tn');
    expect(ALL_ROLES).not.toContain('tp_showroom');
  });

  it('CREATABLE_ROLES ẩn platform_owner (còn 12)', () => {
    expect(CREATABLE_ROLES).toHaveLength(12);
    expect(CREATABLE_ROLES).not.toContain('platform_owner');
  });

  it('isCreatableRole chặn platform_owner và vai trò không hợp lệ', () => {
    expect(isCreatableRole('platform_owner')).toBe(false);
    expect(isCreatableRole('tp_showroom')).toBe(false);
    expect(isCreatableRole('khong_co')).toBe(false);
    expect(isCreatableRole('tvbh')).toBe(true);
    expect(isCreatableRole('digital_mkt')).toBe(true);
  });

  it('digital_mkt: phạm vi công ty, có báo cáo, không phân giao', () => {
    expect(ROLE_SCOPE_KIND.digital_mkt).toBe('company');
    expect(CAN_VIEW_REPORTS.has('digital_mkt')).toBe(true);
    expect(CAN_ASSIGN.has('digital_mkt')).toBe(false);
  });

  it('mọi bảng vai trò khớp đúng tập ALL_ROLES (không thiếu/thừa key)', () => {
    const expected = [...ALL_ROLES].sort();
    for (const map of [ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_SCOPE, ROLE_CAN, ROLE_CANNOT, ROLE_NEEDS, ROLE_COLOR, ROLE_SCOPE_KIND]) {
      expect(Object.keys(map).sort()).toEqual(expected);
    }
  });

  it('tn (Trưởng nhóm bán hàng): phạm vi phòng, phân giao được, có báo cáo', () => {
    expect(ROLE_SCOPE_KIND.tn).toBe('team');
    expect(CAN_ASSIGN.has('tn')).toBe(true);
    expect(CAN_VIEW_REPORTS.has('tn')).toBe(true);
  });

  it('vai trò cấp thương hiệu/showroom dùng phạm vi đa phần', () => {
    expect(ROLE_SCOPE_KIND.gd_brand).toBe('brand');
    expect(ROLE_SCOPE_KIND.tp_brand).toBe('brand');
    expect(ROLE_SCOPE_KIND.mkt_brand).toBe('brand');
    expect(ROLE_SCOPE_KIND.gd_showroom).toBe('showroom');
    expect(ROLE_SCOPE_KIND.mkt_showroom).toBe('showroom');
  });
});
