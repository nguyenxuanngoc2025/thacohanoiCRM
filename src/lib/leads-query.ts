// Hàm thuần cho phân trang server trang /leads: parse URL ↔ query, preset thời gian,
// tách từ khoá, map nguồn, tính trang. Tái dùng resolveRange + normalizeText có sẵn.
import { resolveRange, isRangeKey } from './report-range';
import { normalizeText } from './search';
import type { SourceCatalog } from './source-catalog';

export type LeadTab = 'all' | 'pending' | 'contacted' | 'overdue';
export type LeadSortKey =
  | 'time' | 'name' | 'phone' | 'showroom' | 'team' | 'brand' | 'model' | 'assignee' | 'class';
export type RangePreset = 'all' | 'today' | 'this_week' | 'this_month' | 'last_month' | '30d' | 'custom';
export const PAGE_SIZE = 50;

export interface LeadsQuery {
  q: string; showroom: string; brand: string; model: string; source: string;
  assignee: string; status: string; team: string;
  range: RangePreset; from: string; to: string;
  tab: LeadTab; sort: LeadSortKey; dir: 'asc' | 'desc'; page: number;
}

const TABS: LeadTab[] = ['all', 'pending', 'contacted', 'overdue'];
const SORTS: LeadSortKey[] = ['time', 'name', 'phone', 'showroom', 'team', 'brand', 'model', 'assignee', 'class'];

export const DEFAULT_QUERY: LeadsQuery = {
  q: '', showroom: '', brand: '', model: '', source: '',
  assignee: '', status: '', team: '',
  range: 'all', from: '', to: '',
  tab: 'all', sort: 'time', dir: 'desc', page: 1,
};

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

export function parseLeadsQuery(sp: SP): LeadsQuery {
  const rangeRaw = str(sp.range);
  const range: RangePreset = rangeRaw === 'all' || isRangeKey(rangeRaw) ? (rangeRaw as RangePreset) : 'all';
  const tabRaw = str(sp.tab) as LeadTab;
  const sortRaw = str(sp.sort) as LeadSortKey;
  const dirRaw = str(sp.dir);
  const pageNum = parseInt(str(sp.page), 10);
  return {
    q: str(sp.q), showroom: str(sp.showroom), brand: str(sp.brand), model: str(sp.model),
    source: str(sp.source), assignee: str(sp.assignee), status: str(sp.status), team: str(sp.team),
    range, from: str(sp.from), to: str(sp.to),
    tab: TABS.includes(tabRaw) ? tabRaw : 'all',
    sort: SORTS.includes(sortRaw) ? sortRaw : 'time',
    dir: dirRaw === 'asc' ? 'asc' : 'desc',
    page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1,
  };
}

export function queryToSearchParams(q: LeadsQuery): URLSearchParams {
  const sp = new URLSearchParams();
  const put = (k: string, v: string) => { if (v) sp.set(k, v); };
  put('q', q.q); put('showroom', q.showroom); put('brand', q.brand); put('model', q.model);
  put('source', q.source); put('assignee', q.assignee); put('status', q.status); put('team', q.team);
  if (q.range !== 'all') put('range', q.range);
  if (q.range === 'custom') { put('from', q.from); put('to', q.to); }
  if (q.tab !== 'all') put('tab', q.tab);
  if (q.sort !== 'time') put('sort', q.sort);
  if (q.dir !== 'desc') put('dir', q.dir);
  if (q.page > 1) put('page', String(q.page));
  return sp;
}

/** Tách từ khoá thành phần SỐ (SĐT) và phần CHỮ (tên, bỏ dấu). text=null nếu từ khoá không có ký tự chữ. */
export function splitQuery(query: string): { digits: string; text: string | null } {
  const q = query.trim();
  if (!q) return { digits: '', text: null };
  let digits = q.replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 10) digits = '0' + digits.slice(2);
  const text = /\D/.test(q) ? normalizeText(q) : null;
  return { digits, text: text || null };
}

/** Danh sách 'source' thuộc một platform (để lọc SQL: source = ANY(list)). '' → null = không lọc. */
export function platformToSources(platform: string, catalog: SourceCatalog): string[] | null {
  if (!platform) return null;
  const out = Object.keys(catalog.valueToPlatform).filter((v) => catalog.valueToPlatform[v] === platform);
  // Nguồn "lạ" (tên kênh tự lưu = chính platform, không có trong map) → khớp chính nó.
  if (out.length === 0) return [platform.charAt(0).toLowerCase() + platform.slice(1), platform];
  return out;
}

export function presetRange(range: RangePreset, nowMs: number, from: string, to: string): { fromMs: number; toMs: number } | null {
  if (range === 'all') return null;
  return resolveRange(range, nowMs, from || undefined, to || undefined);
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

export function clampPage(page: number, total: number, size = PAGE_SIZE): number {
  return Math.min(Math.max(1, page), pageCount(total, size));
}
