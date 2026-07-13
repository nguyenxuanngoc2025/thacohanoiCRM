import { describe, it, expect } from 'vitest';
import {
  computeKpis, computeFunnel, groupBySource, groupByChannel, groupByAssignee, groupByModel,
  dailyTrend, failReasons, statusDistribution, isOverdue, crossShowroomBrand, crossDimension,
  effectiveStatus, groupByTeam, groupByDimension, childDimension, compareKpis, rankChildren,
  sourceQuality,
  type ReportLead, type ReportLevel,
} from './reports';

const base: ReportLead = {
  status: null, source: 'facebook', brand_id: 'b1', brand_name: 'KIA',
  model_id: 'm1', model_name: 'Sonet',
  showroom_id: 's1', showroom_name: 'KIA HN', assigned_to: 'u1', assignee_name: 'An',
  sales_team_id: null, team_name: null,
  created_at: '2026-06-10T03:00:00Z', last_contact_at: null, next_contact_at: null, fail_reason: null,
  b10_on: false, b10_status: null,
};
const L = (o: Partial<ReportLead>): ReportLead => ({ ...base, ...o });

const NOW = Date.parse('2026-06-25T00:00:00Z');

describe('computeKpis', () => {
  it('đếm đúng tổng/đã liên hệ/ký HĐ/loại + tỉ lệ', () => {
    const leads = [
      L({ status: 'KHĐ', last_contact_at: '2026-06-11T00:00:00Z' }),
      L({ status: 'GDTD', last_contact_at: '2026-06-11T00:00:00Z' }),
      L({ status: 'Fail' }),
      L({ status: null }),
    ];
    const k = computeKpis(leads, NOW);
    expect(k.total).toBe(4);
    expect(k.contacted).toBe(2);
    expect(k.contactRate).toBe(50);
    expect(k.interested).toBe(0); // không có KHQT trong tập này
    expect(k.following).toBe(1);
    expect(k.won).toBe(1);
    expect(k.winRate).toBe(25);
    expect(k.fail).toBe(1);
    expect(k.failRate).toBe(25);
  });

  it('tổng = 0 thì tỉ lệ = 0 (không chia 0)', () => {
    expect(computeKpis([], NOW).winRate).toBe(0);
  });

  it('đếm quá hạn: đã giao TVBH + chưa chuyển trạng thái + hạn SLA đã trôi qua', () => {
    const leads = [
      L({ status: null, next_contact_at: '2026-06-20T00:00:00Z' }), // quá hạn
      L({ status: null, next_contact_at: '2026-06-30T00:00:00Z' }), // chưa tới hạn
      L({ status: 'KHQT', next_contact_at: '2026-06-20T00:00:00Z' }), // đã chuyển trạng thái → không tính
      L({ status: null, assigned_to: null, next_contact_at: '2026-06-20T00:00:00Z' }), // chưa giao → không tính
    ];
    expect(computeKpis(leads, NOW).overdue).toBe(1);
  });
});

describe('effectiveStatus — trạng thái cuối cho báo cáo (best app vs B10)', () => {
  it('lấy mức cao hơn giữa status app và b10_status', () => {
    expect(effectiveStatus(L({ status: 'KHQT', b10_status: 'GDTD' }))).toBe('GDTD');
    expect(effectiveStatus(L({ status: 'GDTD', b10_status: 'KHQT' }))).toBe('GDTD');
    expect(effectiveStatus(L({ status: null, b10_status: 'KHĐ' }))).toBe('KHĐ');
    expect(effectiveStatus(L({ status: 'Fail', b10_status: null }))).toBe('Fail');
    expect(effectiveStatus(L({ status: null, b10_status: null }))).toBeNull();
  });

  it('KPIs dùng trạng thái cuối: B10 nâng lead lên GDTD/KHĐ dù app chưa cập nhật', () => {
    const leads = [
      L({ status: 'KHQT', b10_status: 'KHĐ', last_contact_at: '2026-06-11T00:00:00Z' }), // won theo B10
      L({ status: null, b10_status: 'GDTD' }), // following theo B10
    ];
    const k = computeKpis(leads, NOW);
    expect(k.won).toBe(1);
    expect(k.following).toBe(1);
  });
});

describe('isOverdue', () => {
  it('đã giao + chưa chuyển trạng thái + quá hạn SLA → quá hạn', () => {
    expect(isOverdue(L({ status: null, next_contact_at: '2026-06-20T00:00:00Z' }), NOW)).toBe(true);
  });
  it('đã chuyển trạng thái (kể cả đã chốt) → không quá hạn', () => {
    expect(isOverdue(L({ status: 'KHĐ', next_contact_at: '2026-06-20T00:00:00Z' }), NOW)).toBe(false);
    expect(isOverdue(L({ status: 'KHQT', next_contact_at: '2026-06-20T00:00:00Z' }), NOW)).toBe(false);
  });
  it('chưa giao TVBH → không quá hạn dù đã trôi hạn', () => {
    expect(isOverdue(L({ status: null, assigned_to: null, next_contact_at: '2026-06-20T00:00:00Z' }), NOW)).toBe(false);
  });
});

describe('computeFunnel', () => {
  it('các bậc lũy tiến giảm dần và đúng %', () => {
    const leads = [
      L({ status: 'KHĐ', last_contact_at: '2026-06-11T00:00:00Z' }),
      L({ status: 'GDTD', last_contact_at: '2026-06-11T00:00:00Z' }),
      L({ status: 'KHQT', last_contact_at: '2026-06-11T00:00:00Z' }),
      L({ status: null, last_contact_at: null }),
    ];
    const f = computeFunnel(leads);
    expect(f.map((s) => s.count)).toEqual([4, 3, 3, 2, 1]);
    expect(f[0].pct).toBe(100);
    expect(f[4].pct).toBe(25);
    // luôn không tăng
    for (let i = 1; i < f.length; i++) expect(f[i].count).toBeLessThanOrEqual(f[i - 1].count);
  });
});

describe('groupBySource', () => {
  it('gom theo nguồn, tính tỉ lệ chốt, sắp nhiều lead trước', () => {
    const leads = [
      L({ source: 'facebook', status: 'KHĐ', last_contact_at: '2026-06-11T00:00:00Z' }),
      L({ source: 'facebook', status: 'Fail' }),
      L({ source: 'google', status: 'KHĐ' }),
      L({ source: null }),
    ];
    const rows = groupBySource(leads, NOW);
    expect(rows[0].key).toBe('Facebook');
    expect(rows[0].leads).toBe(2);
    expect(rows[0].won).toBe(1);
    expect(rows[0].winRate).toBe(50);
    const none = rows.find((r) => r.key === '__none__');
    expect(none?.label).toBe('Không rõ nguồn');
  });

  it('gom fb_message/fb_comment vào chung nguồn Facebook (không tách thành nguồn riêng)', () => {
    const leads = [
      L({ source: 'facebook' }),
      L({ source: 'fb_message' }),
      L({ source: 'fb_comment' }),
    ];
    const rows = groupBySource(leads, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('Facebook');
    expect(rows[0].leads).toBe(3);
  });

  it('tính đủ chỉ số phân tích: tỉ trọng, đã LH %, theo dõi, loại %, quá hạn', () => {
    const leads = [
      L({ source: 'facebook', status: 'GDTD', last_contact_at: '2026-06-11T00:00:00Z' }),
      L({ source: 'facebook', status: 'KHQT', last_contact_at: '2026-06-11T00:00:00Z' }), // đã LH, quan tâm
      L({ source: 'facebook', status: 'Fail' }),
      L({ source: 'facebook', status: null, next_contact_at: '2026-06-20T00:00:00Z' }), // quá hạn (chưa chuyển trạng thái)
      L({ source: 'google', status: 'KHĐ', last_contact_at: '2026-06-11T00:00:00Z' }),
    ];
    const fb = groupBySource(leads, NOW).find((r) => r.key === 'Facebook')!;
    expect(fb.leads).toBe(4);
    expect(fb.share).toBe(80); // 4/5
    expect(fb.contacted).toBe(2);
    expect(fb.contactRate).toBe(50);
    expect(fb.interested).toBe(1); // KHQT
    expect(fb.following).toBe(1); // GDTD
    expect(fb.fail).toBe(1);
    expect(fb.failRate).toBe(25);
    expect(fb.overdue).toBe(1);
  });
});

describe('groupByChannel', () => {
  it('gom theo CHI TIẾT KÊNH (giá trị source thô), nhãn dùng sourceLabel', () => {
    const leads = [
      L({ source: 'facebook' }),
      L({ source: 'facebook' }),
      L({ source: 'fb_message' }),
    ];
    const rows = groupByChannel(leads, NOW);
    // facebook và fb_message là 2 kênh KHÁC nhau (khác groupBySource gộp về Facebook)
    expect(rows).toHaveLength(2);
    const fb = rows.find((r) => r.key === 'facebook')!;
    expect(fb.leads).toBe(2);
    expect(fb.label).toBe('Lead Ads');
    const msg = rows.find((r) => r.key === 'fb_message')!;
    expect(msg.leads).toBe(1);
    expect(msg.label).toBe('Tin nhắn');
  });

  it('source null → nhóm __none__ nhãn "Không rõ kênh"', () => {
    const rows = groupByChannel([L({ source: null })], NOW);
    expect(rows[0].key).toBe('__none__');
    expect(rows[0].label).toBe('Không rõ kênh');
  });

  it('groupByDimension("channel") = groupByChannel', () => {
    const leads = [L({ source: 'facebook' }), L({ source: 'fb_message' })];
    expect(groupByDimension(leads, 'channel', NOW)).toEqual(groupByChannel(leads, NOW));
  });
});

describe('groupByAssignee', () => {
  it('chỉ lead đã giao, xếp theo ký HĐ giảm dần', () => {
    const leads = [
      L({ assigned_to: 'u1', assignee_name: 'An', status: 'KHQT' }),
      L({ assigned_to: 'u2', assignee_name: 'Bình', status: 'KHĐ' }),
      L({ assigned_to: null, assignee_name: null, status: 'KHĐ' }), // chưa giao → bỏ
    ];
    const rows = groupByAssignee(leads, NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe('Bình');
    expect(rows[0].won).toBe(1);
  });
});

describe('groupByModel', () => {
  it('gom theo dòng xe; lead chưa gán gộp "Chưa gán dòng xe"', () => {
    const leads = [
      L({ model_id: 'm1', model_name: 'Sonet', status: 'KHĐ' }),
      L({ model_id: 'm1', model_name: 'Sonet', status: 'KHQT' }),
      L({ model_id: 'm2', model_name: 'Seltos', status: 'Fail' }),
      L({ model_id: null, model_name: null }),
    ];
    const rows = groupByModel(leads, NOW);
    expect(rows[0].key).toBe('m1');
    expect(rows[0].leads).toBe(2);
    expect(rows[0].won).toBe(1);
    const none = rows.find((r) => r.key === '__none__');
    expect(none?.label).toBe('Chưa gán dòng xe');
  });
});

describe('crossDimension brand × model', () => {
  it('hàng=thương hiệu, cột=dòng xe — ô số lead/ký HĐ đúng', () => {
    const leads = [
      L({ brand_id: 'kia', brand_name: 'KIA', model_id: 'sonet', model_name: 'Sonet', status: 'KHĐ' }),
      L({ brand_id: 'kia', brand_name: 'KIA', model_id: 'sonet', model_name: 'Sonet', status: 'KHQT' }),
      L({ brand_id: 'kia', brand_name: 'KIA', model_id: 'seltos', model_name: 'Seltos', status: 'KHĐ' }),
    ];
    const p = crossDimension(leads, 'brand', 'model');
    const kia = p.rows.find((r) => r.key === 'kia')!;
    expect(kia.cells['sonet']).toEqual({ leads: 2, won: 1 });
    expect(kia.cells['seltos']).toEqual({ leads: 1, won: 1 });
    expect(kia.total).toEqual({ leads: 3, won: 2 });
  });
});

describe('crossShowroomBrand', () => {
  it('hàng=showroom, cột=brand; ô + tổng hàng/cột + tổng chung khớp', () => {
    const leads = [
      L({ showroom_id: 's1', showroom_name: 'HN', brand_id: 'kia', brand_name: 'KIA', status: 'KHĐ' }),
      L({ showroom_id: 's1', showroom_name: 'HN', brand_id: 'kia', brand_name: 'KIA', status: 'KHQT' }),
      L({ showroom_id: 's1', showroom_name: 'HN', brand_id: 'mz', brand_name: 'Mazda', status: 'KHĐ' }),
      L({ showroom_id: 's2', showroom_name: 'SG', brand_id: 'kia', brand_name: 'KIA', status: 'Fail' }),
    ];
    const p = crossShowroomBrand(leads);
    expect(p.cols.map((c) => c.key)).toEqual(['kia', 'mz']); // kia nhiều lead hơn → trước
    const hn = p.rows.find((r) => r.key === 's1')!;
    expect(hn.cells['kia']).toEqual({ leads: 2, won: 1 });
    expect(hn.cells['mz']).toEqual({ leads: 1, won: 1 });
    expect(hn.total).toEqual({ leads: 3, won: 2 });
    expect(p.colTotals['kia']).toEqual({ leads: 3, won: 1 });
    expect(p.grandTotal).toEqual({ leads: 4, won: 2 });
  });
});

describe('dailyTrend', () => {
  it('mọi ngày trong kỳ đều có, kể cả ngày 0 lead', () => {
    const leads = [
      L({ created_at: '2026-06-10T03:00:00Z' }),
      L({ created_at: '2026-06-10T20:00:00Z' }),
      L({ created_at: '2026-06-12T05:00:00Z' }),
    ];
    const t = dailyTrend(leads, Date.parse('2026-06-10T00:00:00Z'), Date.parse('2026-06-12T23:59:59Z'));
    expect(t).toEqual([
      { date: '2026-06-10', count: 2 },
      { date: '2026-06-11', count: 0 },
      { date: '2026-06-12', count: 1 },
    ]);
  });
});

describe('failReasons', () => {
  it('chỉ đếm lead Fail, gộp lý do, sắp giảm dần', () => {
    const leads = [
      L({ status: 'Fail', fail_reason: 'Chỉ khảo giá, không mua' }),
      L({ status: 'Fail', fail_reason: 'Chỉ khảo giá, không mua' }),
      L({ status: 'Fail', fail_reason: null }),
      L({ status: 'KHĐ' }),
    ];
    const r = failReasons(leads);
    expect(r[0]).toEqual({ reason: 'Chỉ khảo giá, không mua', count: 2 });
    expect(r.find((x) => x.reason === 'Không ghi lý do')?.count).toBe(1);
  });
});

describe('statusDistribution', () => {
  it('gồm chưa phân loại, bỏ trạng thái 0, đúng thứ tự', () => {
    const leads = [L({ status: null }), L({ status: 'KHĐ' }), L({ status: 'KHĐ' })];
    const d = statusDistribution(leads);
    expect(d[0]).toEqual({ code: '__none__', label: 'Chưa phân loại', count: 1 });
    expect(d.find((s) => s.code === 'KHĐ')?.count).toBe(2);
    expect(d.find((s) => s.code === 'KHQT')).toBeUndefined();
  });
});

describe('chỉ số B10', () => {
  it('computeKpis đếm Lên B10, %, và phân loại theo b10_status', () => {
    const leads = [
      L({ b10_on: true, b10_status: 'KHĐ' }),
      L({ b10_on: true, b10_status: 'KHQT' }),
      L({ b10_on: true, b10_status: 'GDTD' }),
      L({ b10_on: true, b10_status: 'Fail' }),
      L({ b10_on: false, b10_status: null }),
    ];
    const k = computeKpis(leads, NOW);
    expect(k.b10On).toBe(4);
    expect(k.b10Rate).toBe(80); // 4/5
    expect(k.b10Interested).toBe(1); // KHQT·B10
    expect(k.b10Following).toBe(1);  // GDTD·B10
    expect(k.b10Won).toBe(1);        // KHĐ·B10
    expect(k.b10Loai).toBe(1);       // Loại·B10
  });

  it('groupBySource cộng đúng chỉ số B10 theo nhóm', () => {
    const leads = [
      L({ source: 'facebook', b10_on: true, b10_status: 'KHĐ' }),
      L({ source: 'facebook', b10_on: false, b10_status: null }),
    ];
    const fb = groupBySource(leads, NOW).find((r) => r.key === 'Facebook')!;
    expect(fb.b10On).toBe(1);
    expect(fb.b10Rate).toBe(50);
    expect(fb.b10Won).toBe(1);
  });
});

describe('groupByTeam', () => {
  it('gom theo phòng bán hàng; lead chưa gán phòng gộp "Chưa gán phòng"', () => {
    const leads = [
      L({ sales_team_id: 't1', team_name: 'Phòng 1', status: 'KHĐ' }),
      L({ sales_team_id: 't1', team_name: 'Phòng 1', status: 'KHQT' }),
      L({ sales_team_id: 't2', team_name: 'Phòng 2', status: 'Fail' }),
      L({ sales_team_id: null, team_name: null }),
    ];
    const rows = groupByTeam(leads, NOW);
    expect(rows[0].key).toBe('t1');
    expect(rows[0].leads).toBe(2);
    expect(rows[0].won).toBe(1);
    const none = rows.find((r) => r.key === '__none__');
    expect(none?.label).toBe('Chưa gán phòng');
  });

  it('groupByDimension("team") gọi groupByTeam', () => {
    const leads = [L({ sales_team_id: 't1', team_name: 'Phòng 1' })];
    expect(groupByDimension(leads, 'team', NOW)[0].label).toBe('Phòng 1');
  });
});

describe('compareKpis — delta so kỳ trước', () => {
  it('tính delta tuyệt đối cho mỗi KPI (current - previous)', () => {
    const cur = [
      L({ status: 'KHĐ', last_contact_at: '2026-06-11T00:00:00Z' }),
      L({ status: 'KHĐ', last_contact_at: '2026-06-11T00:00:00Z' }),
      L({ status: null }),
    ];
    const prev = [
      L({ status: 'KHĐ', last_contact_at: '2026-05-11T00:00:00Z' }),
    ];
    const c = compareKpis(cur, prev, NOW);
    expect(c.current.total).toBe(3);
    expect(c.previous.total).toBe(1);
    expect(c.delta.total).toBe(2);
    expect(c.delta.won).toBe(1); // 2 - 1
    expect(c.delta.winRate).toBeCloseTo(66.7 - 100, 1);
  });

  it('kỳ trước rỗng: delta = current', () => {
    const c = compareKpis([L({ status: 'KHĐ' })], [], NOW);
    expect(c.delta.total).toBe(1);
  });
});

describe('childDimension — cấp dưới để so sánh', () => {
  it('map đúng từng cấp', () => {
    expect(childDimension('company')).toBe('showroom');
    expect(childDimension('brand')).toBe('showroom');
    expect(childDimension('showroom')).toBe('team');
    expect(childDimension('team')).toBe('assignee');
    expect(childDimension('personal')).toBeNull();
  });
});

describe('rankChildren — xếp hạng cấp dưới + Δ%chốt', () => {
  it('company xếp hạng showroom theo %chốt giảm dần, ghép Δ 2 kỳ', () => {
    const cur = [
      L({ showroom_id: 's1', showroom_name: 'HN', status: 'KHĐ', last_contact_at: '2026-06-11T00:00:00Z' }),
      L({ showroom_id: 's1', showroom_name: 'HN', status: 'Fail' }),
      L({ showroom_id: 's2', showroom_name: 'SG', status: 'KHĐ' }),
    ];
    const prev = [
      L({ showroom_id: 's1', showroom_name: 'HN', status: 'Fail' }), // %chốt trước = 0
      L({ showroom_id: 's2', showroom_name: 'SG', status: 'KHĐ' }),  // %chốt trước = 100
    ];
    const rows = rankChildren(cur, prev, 'company', NOW);
    expect(rows[0].key).toBe('s2'); // 100% chốt → hạng 1
    expect(rows[0].winRateDelta).toBe(0); // 100 - 100
    const hn = rows.find((r) => r.key === 's1')!;
    expect(hn.winRate).toBe(50);
    expect(hn.winRateDelta).toBe(50); // 50 - 0
  });

  it('personal (childDimension null) trả mảng rỗng', () => {
    expect(rankChildren([L({})], [], 'personal', NOW)).toEqual([]);
  });
});

describe('sourceQuality — nguồn theo %chốt + Δ', () => {
  it('sắp theo %chốt giảm dần, ghép Δ so kỳ trước', () => {
    const cur = [
      L({ source: 'google', status: 'KHĐ' }),
      L({ source: 'facebook', status: 'KHĐ' }),
      L({ source: 'facebook', status: 'Fail' }),
    ];
    const prev = [
      L({ source: 'facebook', status: 'KHĐ' }), // %chốt fb trước = 100
    ];
    const rows = sourceQuality(cur, prev, NOW);
    expect(rows[0].key).toBe('Google'); // 100% chốt → trước
    const fb = rows.find((r) => r.key === 'Facebook')!;
    expect(fb.winRate).toBe(50);
    expect(fb.winRateDelta).toBe(-50); // 50 - 100
  });
});
