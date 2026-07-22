'use server';
import { createClient } from '@/lib/supabase/server';
import { loadSourceCatalog } from '@/lib/source-catalog';
import { getOpenBrandIds, getInactiveShowroomIds } from '@/lib/company-brands';
import { splitQuery, platformToSources, presetRange, type LeadsQuery } from '@/lib/leads-query';
import type { LeadRow } from './LeadsTable';

// Trần an toàn để tránh tải quá lớn khi công ty có rất nhiều lead.
const EXPORT_CAP = 50000;

/** Lấy TOÀN BỘ lead khớp bộ lọc hiện tại (bỏ phân trang) để xuất Excel/CSV. RLS tự áp scope. */
export async function exportLeads(query: LeadsQuery): Promise<LeadRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: me } = await supabase.from('users').select('company_id').eq('id', user.id).maybeSingle();
  const sourceCatalog = await loadSourceCatalog(supabase);
  const openBrandIds = await getOpenBrandIds(supabase, me?.company_id ?? null);
  const inactiveSrIds = [...new Set(await getInactiveShowroomIds(supabase, me?.company_id ?? null))];
  const rangeMs = presetRange(query.range, Date.now(), query.from, query.to);
  const { digits, text } = splitQuery(query.q);
  const { data, error } = await supabase.rpc('leads_search_page', {
    p_from: rangeMs ? new Date(rangeMs.fromMs).toISOString() : null,
    p_to: rangeMs ? new Date(rangeMs.toMs).toISOString() : null,
    p_showroom: query.showroom || null,
    p_brand: query.brand || null,
    p_model: query.model || null,
    p_sources: platformToSources(query.source, sourceCatalog),
    p_assignee: query.assignee && query.assignee !== '__none__' ? query.assignee : null,
    p_assignee_none: query.assignee === '__none__',
    p_status: query.status && query.status !== '__none__' ? query.status : null,
    p_status_none: query.status === '__none__',
    p_team: query.team || null,
    p_tab: query.tab,
    p_q_digits: digits,
    p_q_text: text,
    p_open_brands: openBrandIds.length ? openBrandIds : null,
    p_inactive_showrooms: inactiveSrIds,
    p_sort: query.sort,
    p_dir: query.dir,
    p_limit: EXPORT_CAP,
    p_offset: 0,
    p_b10: true,
  });
  if (error) throw new Error(error.message);
  return ((data as { rows: LeadRow[] } | null)?.rows) ?? [];
}
