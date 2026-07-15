import { describe, it, expect } from 'vitest';
import {
  channelFromPlatform, buildMktPlanningReport, toChannelTsv,
  type ModelCatalogItem,
} from './mkt-planning-report';
import { type ReportLead } from './reports';

function mk(p: Partial<ReportLead>): ReportLead {
  return {
    status: null, source: null, brand_id: 'A', brand_name: 'Hãng A',
    model_id: null, model_name: null, showroom_id: 'S1', showroom_name: 'SR1',
    sales_team_id: null, team_name: null, assigned_to: null, assignee_name: null,
    created_at: '2026-07-01T00:00:00Z', last_contact_at: null, next_contact_at: null,
    fail_reason: null, b10_status: null, b10_on: false, ...p,
  };
}

const models: ModelCatalogItem[] = [
  { id: 'm2', brand_id: 'A', brand_name: 'Hãng A', name: 'Model Hai', sort_order: 2 },
  { id: 'm1', brand_id: 'A', brand_name: 'Hãng A', name: 'Model Một', sort_order: 1 },
  { id: 'm3', brand_id: 'B', brand_name: 'Hãng B', name: 'Model Ba', sort_order: 1 },
];

const platformOf = (l: ReportLead) => l.source; // test dùng source = platform key sẵn

describe('channelFromPlatform', () => {
  it('map đúng 3 kênh', () => {
    expect(channelFromPlatform('facebook')).toBe('Facebook');
    expect(channelFromPlatform('google')).toBe('Google');
    expect(channelFromPlatform('zalo')).toBe('Khác');
    expect(channelFromPlatform(null)).toBe('Khác');
  });
  it('khớp tên Nguồn viết hoa từ sourcePlatform (Facebook/Google) — chống hồi quy', () => {
    expect(channelFromPlatform('Facebook')).toBe('Facebook');
    expect(channelFromPlatform('Google')).toBe('Google');
    expect(channelFromPlatform('Zalo OA')).toBe('Khác');
  });
});

describe('buildMktPlanningReport', () => {
  it('đếm đúng theo model × channel × trạng thái, giữ thứ tự sort_order', () => {
    const leads = [
      mk({ brand_id: 'A', model_id: 'm1', source: 'facebook', status: 'KHQT' }),
      mk({ brand_id: 'A', model_id: 'm1', source: 'facebook', status: 'KHQT' }),
      mk({ brand_id: 'A', model_id: 'm1', source: 'google', status: 'GDTD' }),
      mk({ brand_id: 'A', model_id: 'm2', source: 'zalo', status: 'KHĐ' }),
      mk({ brand_id: 'A', model_id: 'm1', source: 'facebook', status: 'Fail' }), // không tính
      mk({ brand_id: 'A', model_id: null, source: 'facebook', status: 'KHQT' }), // unmapped
    ];
    const rep = buildMktPlanningReport(leads, models, platformOf);
    // 2 brand, sắp theo brand_name
    expect(rep.map((b) => b.brand_id)).toEqual(['A', 'B']);
    const a = rep[0];
    // model rows theo sort_order: m1 (1) trước m2 (2)
    expect(a.rows.map((r) => r.model_id)).toEqual(['m1', 'm2']);
    expect(a.rows[0].cells.Facebook.khqt).toBe(2);
    expect(a.rows[0].cells.Google.gdtd).toBe(1);
    expect(a.rows[1].cells['Khác'].khd).toBe(1);
    // total = tổng các dòng (KHÔNG gồm unmapped)
    expect(a.total.Facebook.khqt).toBe(2);
    expect(a.total.Google.gdtd).toBe(1);
    expect(a.total['Khác'].khd).toBe(1);
    expect(a.unmapped).toBe(1);
    // brand B: có dòng model 0 lead
    expect(rep[1].rows.map((r) => r.model_id)).toEqual(['m3']);
    expect(rep[1].rows[0].cells.Facebook.khqt).toBe(0);
  });
});

describe('toChannelTsv', () => {
  it('xuất TSV đúng số dòng, cột KHQT\\tGDTD\\tKHĐ, ngăn dòng \\n', () => {
    const leads = [
      mk({ brand_id: 'A', model_id: 'm1', source: 'facebook', status: 'KHQT' }),
      mk({ brand_id: 'A', model_id: 'm2', source: 'facebook', status: 'GDTD' }),
    ];
    const rep = buildMktPlanningReport(leads, models, platformOf);
    expect(toChannelTsv(rep[0], 'Facebook')).toBe('1\t0\t0\n0\t1\t0');
  });
});
