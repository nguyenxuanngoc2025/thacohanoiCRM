import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getOpenBrandIds, getInactiveShowroomIds } from '@/lib/company-brands';
import { loadSourceCatalog } from '@/lib/source-catalog';
import { getTenant } from '@/lib/tenant';
import type { UserRole } from '@/types/database';
import type { ReportLead, ReportLevel } from '@/lib/reports';
import type { ModelCatalogItem } from '@/lib/mkt-planning-report';
import type { KpiRow } from '@/lib/kpi-targets';
import type { SourceCatalog } from '@/lib/source';
import { resolveRange, isRangeKey, type RangeKey } from '@/lib/report-range';
import { roleToReportLevel } from './report-level';
import { resolveCreatorScope } from '@/lib/lead-scope';

interface RawLead {
  status: ReportLead['status'];
  source: string | null;
  brand_id: string;
  model_id: string | null;
  showroom_id: string | null;
  sales_team_id: string | null;
  assigned_to: string | null;
  created_at: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  fail_reason: string | null;
  b10_status: ReportLead['b10_status'];
  b10_synced_at: string | null;
  brand: { name: string } | null;
  model: { name: string } | null;
  showroom: { name: string } | null;
  sales_team: { name: string } | null;
  assignee: { full_name: string } | null;
}

const iso = (ms: number) => new Date(ms).toISOString();
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const HN_COMPANY = 'ec6b9c22-1317-4884-a496-cf0793d6c7b8';

/** Props ReportsView (không gồm basePath — do route quyết). */
export interface ReportsProps {
  leads: ReportLead[];
  prevLeads: ReportLead[];
  sourceCatalog: SourceCatalog;
  range: RangeKey;
  from: string;
  to: string;
  fromMs: number;
  toMs: number;
  showB10: boolean;
  reportLevel: ReportLevel;
  models: ModelCatalogItem[];
  showMktPlanning: boolean;
  kpiRows: KpiRow[];
  kpiYear: number;
  kpiMonth: number;
}

/**
 * Tải TOÀN BỘ dữ liệu báo cáo cho <ReportsView>. Dùng chung cho /reports và /embed/reports
 * (1 NGUỒN DUY NHẤT — CRM đổi báo cáo, Budget /digital nhúng iframe tự cập nhật).
 * Giả định `supabase` đã xác thực và `me` có role hợp lệ (route tự gác trước khi gọi).
 */
export async function loadReportsProps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  user: User,
  me: { role: string; company_id: string | null },
  sp: { range?: string; from?: string; to?: string },
  opts: { scopeToUser?: boolean } = {},
): Promise<ReportsProps> {
  const range = isRangeKey(sp.range) ? sp.range : 'this_month';
  const { fromMs, toMs } = resolveRange(range, Date.now(), sp.from, sp.to);

  const openBrandIds = await getOpenBrandIds(supabase, me.company_id ?? null);
  const inactiveSrIds = new Set(await getInactiveShowroomIds(supabase, me.company_id ?? null));

  // Phạm vi thương hiệu/showroom của người xem — CHỈ dùng cho bản NHÚNG /digital: báo cáo phải
  // theo đúng vai trò brand/showroom của user, không phơi toàn hệ thống. Báo cáo CRM gốc
  // (/reports, scopeToUser=false) GIỮ NGUYÊN hành vi cũ.
  const scope = opts.scopeToUser ? await resolveCreatorScope(supabase, user.id) : null;
  const scopeLead = (l: ReportLead): boolean => {
    if (!scope) return true;
    if (scope.kind === 'brand' && scope.brandIds) return scope.brandIds.includes(l.brand_id);
    if (scope.kind === 'showroom' && scope.showroomIds) return scope.showroomIds.includes(String(l.showroom_id ?? ''));
    if (scope.kind === 'team' && scope.teamId) return l.sales_team_id === scope.teamId;
    return true; // company / null = không giới hạn
  };

  const tenant = await getTenant();
  const showB10 = tenant?.b10_enabled ?? false;

  const SELECT =
    'status, source, brand_id, model_id, showroom_id, sales_team_id, assigned_to, created_at, last_contact_at, next_contact_at, fail_reason, b10_status, b10_synced_at, brand:brands(name), model:models(name), showroom:showrooms(name), sales_team:sales_teams(name), assignee:users!assigned_to(full_name)';

  const buildBaseQuery = () => {
    let q = supabase.from('leads').select(SELECT);
    if (openBrandIds.length) q = q.in('brand_id', openBrandIds);
    return q;
  };

  const mapLead = (l: RawLead): ReportLead => ({
    status: l.status,
    source: l.source,
    brand_id: l.brand_id,
    brand_name: l.brand?.name ?? '—',
    model_id: l.model_id,
    model_name: l.model?.name ?? null,
    showroom_id: l.showroom_id,
    showroom_name: l.showroom?.name ?? null,
    sales_team_id: l.sales_team_id,
    team_name: l.sales_team?.name ?? null,
    assigned_to: l.assigned_to,
    assignee_name: l.assignee?.full_name ?? null,
    created_at: l.created_at,
    last_contact_at: l.last_contact_at,
    next_contact_at: l.next_contact_at,
    fail_reason: l.fail_reason,
    b10_status: l.b10_status,
    b10_on: l.b10_synced_at != null,
  });

  const { data: raw } = await buildBaseQuery()
    .gte('created_at', iso(fromMs))
    .lte('created_at', iso(toMs))
    .order('created_at', { ascending: false })
    .limit(20000);

  const leads: ReportLead[] = ((raw ?? []) as unknown as RawLead[])
    .map(mapLead)
    .filter((l) => !inactiveSrIds.has(String(l.showroom_id ?? '')))
    .filter(scopeLead);

  const periodMs = toMs - fromMs;
  const prevFromMs = fromMs - periodMs;
  const prevToMs = fromMs;

  const { data: rawPrev } = await buildBaseQuery()
    .gte('created_at', new Date(prevFromMs).toISOString())
    .lt('created_at', new Date(prevToMs).toISOString())
    .order('created_at', { ascending: false })
    .limit(20000);

  const prevLeads: ReportLead[] = ((rawPrev ?? []) as unknown as RawLead[])
    .map(mapLead)
    .filter((l) => !inactiveSrIds.has(String(l.showroom_id ?? '')))
    .filter(scopeLead);

  const { data: modelRows } = await supabase
    .from('models')
    .select('id, brand_id, name, sort_order, brand:brands(name)')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  const models: ModelCatalogItem[] = ((modelRows ?? []) as unknown as {
    id: string; brand_id: string; name: string; sort_order: number | null; brand: { name: string } | null;
  }[])
    .filter((m) => !openBrandIds.length || openBrandIds.includes(m.brand_id))
    .filter((m) => !scope || scope.kind !== 'brand' || !scope.brandIds || scope.brandIds.includes(m.brand_id))
    .map((m) => ({ id: m.id, brand_id: m.brand_id, brand_name: m.brand?.name ?? '—', name: m.name, sort_order: m.sort_order ?? 0 }));

  const showMktPlanning = (['admin', 'mkt_cty', 'digital_mkt', 'mkt_brand'] as UserRole[]).includes(me.role as UserRole);

  const reportLevel = roleToReportLevel(me.role as UserRole);

  const sourceCatalog = await loadSourceCatalog(supabase);

  const KPI_ROLES: UserRole[] = ['admin', 'platform_owner', 'mkt_cty', 'mkt_brand', 'mkt_showroom'];
  const showKpi = KPI_ROLES.includes(me.role as UserRole) && me.company_id === HN_COMPANY;
  const kpiDate = new Date(toMs);
  const kpiYear = showKpi ? kpiDate.getUTCFullYear() : 0;
  const kpiMonth = showKpi ? kpiDate.getUTCMonth() + 1 : 0;
  let kpiRows: KpiRow[] = [];
  if (showKpi) {
    const { data: kpiData } = await supabase.rpc('get_kpi_targets', {
      p_company_id: HN_COMPANY, p_year: kpiYear, p_month: kpiMonth,
    });
    let rows = (kpiData ?? []) as KpiRow[];
    const scope = await resolveCreatorScope(supabase, user.id);
    const norm = (s: string) => s.trim().toLowerCase();
    if (scope?.kind === 'showroom' && scope.showroomIds) {
      const { data: srs } = await supabase.from('showrooms').select('name')
        .in('id', scope.showroomIds.length ? scope.showroomIds : ['00000000-0000-0000-0000-000000000000']);
      const allow = new Set((srs ?? []).map((s) => norm(s.name as string)));
      rows = rows.filter((r) => allow.has(norm(r.showroom_name)));
    } else if (scope?.kind === 'brand' && scope.brandIds) {
      const { data: brs } = await supabase.from('brands').select('name')
        .in('id', scope.brandIds.length ? scope.brandIds : ['00000000-0000-0000-0000-000000000000']);
      const allow = new Set((brs ?? []).map((b) => norm(b.name as string)));
      rows = rows.filter((r) => allow.has(norm(r.brand_name)));
    }
    kpiRows = rows;
  }

  return {
    leads, prevLeads, sourceCatalog, range,
    from: sp.from ?? ymd(fromMs),
    to: sp.to ?? ymd(toMs),
    fromMs, toMs, showB10, reportLevel, models, showMktPlanning, kpiRows, kpiYear, kpiMonth,
  };
}
