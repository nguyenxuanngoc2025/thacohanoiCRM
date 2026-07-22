import { describe, it, expect } from 'vitest';
import {
  DEFAULT_QUERY, parseLeadsQuery, queryToSearchParams, splitQuery,
  platformToSources, presetRange, pageCount, clampPage, PAGE_SIZE,
} from './leads-query';
import { BUILTIN_CATALOG } from './source-catalog';

describe('parseLeadsQuery', () => {
  it('rỗng → mặc định (range all, tab all, page 1, sort time desc)', () => {
    expect(parseLeadsQuery({})).toEqual(DEFAULT_QUERY);
  });
  it('đọc đúng các tham số + kẹp page tối thiểu 1', () => {
    const q = parseLeadsQuery({ q: 'nguyen', brand: 'b1', tab: 'overdue', page: '0', dir: 'asc', sort: 'name' });
    expect(q.q).toBe('nguyen'); expect(q.brand).toBe('b1');
    expect(q.tab).toBe('overdue'); expect(q.page).toBe(1);
    expect(q.dir).toBe('asc'); expect(q.sort).toBe('name');
  });
  it('giá trị lạ rơi về mặc định (tab/sort/dir/range không hợp lệ)', () => {
    const q = parseLeadsQuery({ tab: 'x', sort: 'y', dir: 'z', range: 'w' });
    expect(q.tab).toBe('all'); expect(q.sort).toBe('time');
    expect(q.dir).toBe('desc'); expect(q.range).toBe('all');
  });
});

describe('queryToSearchParams', () => {
  it('bỏ field rỗng/mặc định, giữ field có giá trị', () => {
    const sp = queryToSearchParams({ ...DEFAULT_QUERY, brand: 'b1', page: 2, tab: 'pending' });
    expect(sp.get('brand')).toBe('b1');
    expect(sp.get('page')).toBe('2');
    expect(sp.get('tab')).toBe('pending');
    expect(sp.get('range')).toBeNull(); // 'all' là mặc định → không ghi
    expect(sp.get('sort')).toBeNull();
  });
});

describe('splitQuery', () => {
  it('chỉ chữ → digits rỗng, text chuẩn hoá bỏ dấu', () => {
    expect(splitQuery('Nguyễn')).toEqual({ digits: '', text: 'nguyen' });
  });
  it('chỉ số → digits, text null', () => {
    expect(splitQuery('0914155096')).toEqual({ digits: '0914155096', text: null });
  });
  it('đổi 84… → 0…', () => {
    expect(splitQuery('84914155096').digits).toBe('0914155096');
  });
  it('rỗng → digits rỗng text null', () => {
    expect(splitQuery('  ')).toEqual({ digits: '', text: null });
  });
});

describe('platformToSources', () => {
  it('platform builtin → mảng source values không rỗng', () => {
    const anyPlatform = Object.values(BUILTIN_CATALOG.valueToPlatform)[0];
    const list = platformToSources(anyPlatform, BUILTIN_CATALOG);
    expect(Array.isArray(list)).toBe(true);
    expect(list!.length).toBeGreaterThan(0);
    list!.forEach((s) => expect(BUILTIN_CATALOG.valueToPlatform[s]).toBe(anyPlatform));
  });
  it('rỗng → null (không lọc)', () => {
    expect(platformToSources('', BUILTIN_CATALOG)).toBeNull();
  });
});

describe('presetRange', () => {
  const now = Date.UTC(2026, 6, 22, 5, 0, 0); // 12:00 VN
  it('all → null (không lọc thời gian)', () => {
    expect(presetRange('all', now, '', '')).toBeNull();
  });
  it('today → có from/to', () => {
    const r = presetRange('today', now, '', '');
    expect(r).not.toBeNull();
    expect(r!.fromMs).toBeLessThanOrEqual(now);
    expect(r!.toMs).toBe(now);
  });
});

describe('pageCount / clampPage', () => {
  it('pageCount làm tròn lên', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(50)).toBe(1);
    expect(pageCount(51)).toBe(2);
    expect(pageCount(120)).toBe(3);
  });
  it('clampPage kẹp trong [1, số trang]', () => {
    expect(clampPage(5, 51)).toBe(2); // chỉ 2 trang
    expect(clampPage(0, 200)).toBe(1);
    expect(clampPage(2, 200)).toBe(2);
  });
  it('PAGE_SIZE = 50', () => expect(PAGE_SIZE).toBe(50));
});
