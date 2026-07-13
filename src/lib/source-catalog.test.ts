import { describe, it, expect } from 'vitest';
import { buildSourceCatalog, assertSourceEditable, BUILTIN_SEED, type SourceChannelRow } from './source-catalog';

const rows: SourceChannelRow[] = [
  { platform_key: 'facebook', platform_name: 'Facebook', value: 'facebook', label: 'Lead Ads', is_builtin: true, is_active: true, digital: true, sort_order: 10 },
  { platform_key: 'facebook', platform_name: 'Facebook', value: 'fb_tool', label: 'Tool', is_builtin: false, is_active: true, digital: true, sort_order: 13 },
  { platform_key: 'facebook', platform_name: 'Facebook', value: 'fb_comment', label: 'Bình luận', is_builtin: true, is_active: false, digital: true, sort_order: 12 },
];

describe('buildSourceCatalog', () => {
  it('gộp Nguồn distinct còn active, giữ thứ tự sort_order', () => {
    const c = buildSourceCatalog(rows);
    expect(c.platforms).toEqual([{ key: 'facebook', name: 'Facebook' }]);
  });
  it('variantsByKey chỉ lấy variant active+digital', () => {
    const c = buildSourceCatalog(rows);
    expect(c.variantsByKey.facebook).toEqual([
      { value: 'facebook', label: 'Lead Ads' },
      { value: 'fb_tool', label: 'Tool' },
    ]); // fb_comment inactive → loại khỏi form
  });
  it('bản đồ hiển thị gồm CẢ dòng inactive (lead cũ vẫn hiện đúng nhãn)', () => {
    const c = buildSourceCatalog(rows);
    expect(c.valueToPlatform.fb_comment).toBe('Facebook');
    expect(c.valueToLabel.fb_tool).toBe('Tool');
  });
});

describe('assertSourceEditable', () => {
  const builtin: SourceChannelRow = { platform_key: 'facebook', platform_name: 'Facebook', value: 'facebook', label: 'Lead Ads', is_builtin: true, is_active: true, digital: true, sort_order: 10 };
  it('builtin: chặn đổi value', () => {
    expect(assertSourceEditable(builtin, { value: 'khac' }).ok).toBe(false);
  });
  it('builtin: cho đổi label/is_active', () => {
    expect(assertSourceEditable(builtin, { label: 'Quảng cáo Lead', is_active: false }).ok).toBe(true);
  });
  it('builtin: chặn xoá', () => {
    expect(assertSourceEditable(builtin, { _delete: true }).ok).toBe(false);
  });
});

describe('BUILTIN_SEED', () => {
  it('đủ 9 kênh hệ thống khớp value cũ', () => {
    const vals = BUILTIN_SEED.map((r) => r.value);
    expect(vals).toEqual(['facebook', 'fb_message', 'fb_comment', 'Website form', 'zalo', 'zalo_ads', 'google_hotline', 'google_form_web', 'google_zalo_oa']);
  });
});
