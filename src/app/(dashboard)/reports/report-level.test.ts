import { describe, it, expect } from 'vitest';
import { roleToReportLevel, tabsForLevel, defaultTab, dimensionsForLevel } from './report-level';

describe('roleToReportLevel', () => {
  it('map vai trò → cấp báo cáo', () => {
    expect(roleToReportLevel('gd_cty')).toBe('company');
    expect(roleToReportLevel('admin')).toBe('company');
    expect(roleToReportLevel('gd_brand')).toBe('brand');
    expect(roleToReportLevel('tp_brand')).toBe('brand');
    expect(roleToReportLevel('gd_showroom')).toBe('showroom');
    expect(roleToReportLevel('mkt_showroom')).toBe('showroom');
    expect(roleToReportLevel('tp_phong')).toBe('team');
    expect(roleToReportLevel('tvbh')).toBe('personal');
  });
});

describe('tabsForLevel', () => {
  it('personal ẩn ranking + management', () => {
    const tabs = tabsForLevel('personal');
    expect(tabs).toContain('overview');
    expect(tabs).toContain('source');
    expect(tabs).toContain('tables');
    expect(tabs).not.toContain('ranking');
    expect(tabs).not.toContain('management');
  });
  it('company có đủ 5 tab', () => {
    expect(tabsForLevel('company')).toEqual(['overview', 'ranking', 'management', 'source', 'tables']);
  });
});

describe('defaultTab', () => {
  it('marketing mặc định source, còn lại overview', () => {
    expect(defaultTab('company', true)).toBe('source');
    expect(defaultTab('company', false)).toBe('overview');
    expect(defaultTab('personal', true)).toBe('source');
  });
});

describe('dimensionsForLevel', () => {
  it('company: showroom/brand/model/source/status (không assignee)', () => {
    expect(dimensionsForLevel('company')).toEqual(['showroom', 'brand', 'model', 'source', 'status']);
  });
  it('showroom: team thay showroom', () => {
    expect(dimensionsForLevel('showroom')).toEqual(['team', 'model', 'source', 'status']);
  });
  it('team: assignee', () => {
    expect(dimensionsForLevel('team')).toEqual(['assignee', 'model', 'source', 'status']);
  });
  it('personal: không có chiều đơn vị', () => {
    expect(dimensionsForLevel('personal')).toEqual(['model', 'source', 'status']);
  });
});
