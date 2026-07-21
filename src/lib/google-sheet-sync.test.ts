import { describe, it, expect } from 'vitest';
import { resolveTabConfigs, type SheetConfig } from './google-sheet-sync';

describe('resolveTabConfigs', () => {
  it('tab mới có cấu hình riêng đầy đủ thì giữ nguyên của tab', () => {
    const cfg: SheetConfig = {
      connection_id: 'c1', phone_col: 0, // cấp-dòng (cũ)
      tabs: [
        { title: 'KIA', brand_id: 'b-kia', showroom_ids: ['s1'], phone_col: 2, name_col: 3,
          source_mode: 'fixed', source: 'facebook', model_mode: 'auto', date_col: 5, since: '2026-01-01' },
        { title: 'Mazda', brand_id: 'b-mz', showroom_ids: ['s2'], phone_col: 1, name_col: null,
          source_mode: 'column', source_col: 4, model_mode: 'fixed', model_id: 'm9', since: null },
      ],
    };
    const out = resolveTabConfigs(cfg);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: 'KIA', brand_id: 'b-kia', showroom_ids: ['s1'], phone_col: 2 });
    expect(out[1]).toMatchObject({ title: 'Mazda', brand_id: 'b-mz', phone_col: 1, model_mode: 'fixed', model_id: 'm9' });
  });

  it('tab thiếu trường thì kế thừa cấu hình cấp-dòng (tương thích cũ)', () => {
    const cfg: SheetConfig = {
      connection_id: 'c1', phone_col: 0, name_col: 1, brand_id: 'b-old', showroom_ids: ['sA', 'sB'],
      source_mode: 'fixed', model_mode: 'auto', date_col: 4, since: '2026-06-01',
      tabs: [{ title: 'Sheet1', source: 'zalo' }],
    };
    const out = resolveTabConfigs(cfg);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      title: 'Sheet1', brand_id: 'b-old', showroom_ids: ['sA', 'sB'],
      phone_col: 0, name_col: 1, source_mode: 'fixed', source: 'zalo', date_col: 4, since: '2026-06-01',
    });
  });

  it('cấu hình rất cũ dạng mảng chuỗi vẫn kế thừa cấp-dòng', () => {
    const cfg = { connection_id: 'c1', phone_col: 0, brand_id: 'bX', showroom_ids: ['s1'],
      tabs: ['A', 'B'] } as unknown as SheetConfig;
    const out = resolveTabConfigs(cfg);
    expect(out.map((t) => t.title)).toEqual(['A', 'B']);
    expect(out[0].brand_id).toBe('bX');
    expect(out[1].phone_col).toBe(0);
  });

  it('không có tabs → 1 tab mặc định title rỗng kế thừa cấp-dòng', () => {
    const cfg: SheetConfig = { connection_id: 'c1', phone_col: 3, brand_id: 'bY', showroom_ids: ['s2'] };
    const out = resolveTabConfigs(cfg);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('');
    expect(out[0].phone_col).toBe(3);
    expect(out[0].brand_id).toBe('bY');
  });
});
