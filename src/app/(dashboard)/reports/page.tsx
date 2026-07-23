import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CAN_VIEW_REPORTS } from '@/lib/nav';
import { getOpenBrandIds, getInactiveShowroomIds } from '@/lib/company-brands';
import { loadSourceCatalog } from '@/lib/source-catalog';
import { getTenant } from '@/lib/tenant';
import type { UserRole } from '@/types/database';
import type { ReportLead } from '@/lib/reports';
import type { ModelCatalogItem } from '@/lib/mkt-planning-report';
import type { KpiRow } from '@/lib/kpi-targets';
import ReportsView from './ReportsView';
import { resolveRange, isRangeKey } from '@/lib/report-range';
import { roleToReportLevel } from './report-level';

export const dynamic = 'force-dynamic';

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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
  if (!me?.role || !CAN_VIEW_REPORTS.has(me.role as UserRole)) redirect('/leads');

  const range = isRangeKey(sp.range) ? sp.range : 'this_month';
  const { fromMs, toMs } = resolveRange(range, Date.now(), sp.from, sp.to);

  // Hãng công ty đang mở (whitelist). Lead của hãng đã đóng bị loại khỏi báo cáo/KPI.
  const openBrandIds = await getOpenBrandIds(supabase, me?.company_id ?? null);
  // Showroom đang TẮT → loại lead của nó khỏi báo cáo/KPI (mirror hãng đóng).
  const inactiveSrIds = new Set(await getInactiveShowroomIds(supabase, me?.company_id ?? null));

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

  // Kỳ hiện tại
  const { data: raw } = await buildBaseQuery()
    .gte('created_at', iso(fromMs))
    .lte('created_at', iso(toMs))
    .order('created_at', { ascending: false })
    .limit(20000);

  const leads: ReportLead[] = ((raw ?? []) as unknown as RawLead[])
    .map(mapLead)
    .filter((l) => !inactiveSrIds.has(String(l.showroom_id ?? '')));

  // Kỳ trước (độ dài bằng kỳ hiện tại, ngay trước fromMs)
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
    .filter((l) => !inactiveSrIds.has(String(l.showroom_id ?? '')));

  // Danh mục Dòng xe (để hiện cả dòng 0 lead ở tab Báo cáo cho Marketing).
  const { data: modelRows } = await supabase
    .from('models')
    .select('id, brand_id, name, sort_order, brand:brands(name)')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  const models: ModelCatalogItem[] = ((modelRows ?? []) as unknown as {
    id: string; brand_id: string; name: string; sort_order: number | null; brand: { name: string } | null;
  }[])
    .filter((m) => !openBrandIds.length || openBrandIds.includes(m.brand_id))
    .map((m) => ({ id: m.id, brand_id: m.brand_id, brand_name: m.brand?.name ?? '—', name: m.name, sort_order: m.sort_order ?? 0 }));

  // Tab Báo cáo cho Marketing chỉ cho vai trò marketing + admin.
  const showMktPlanning = (['admin', 'mkt_cty', 'digital_mkt', 'mkt_brand'] as UserRole[]).includes(me.role as UserRole);

  // Suy cấp báo cáo
  const reportLevel = roleToReportLevel(me.role as UserRole);

  const sourceCatalog = await loadSourceCatalog(supabase);

  // Tab KPI Mục tiêu vs Thực hiện — chỉ marketing + admin, chỉ tenant Thaco Auto HN (có budget).
  const KPI_ROLES: UserRole[] = ['admin', 'platform_owner', 'mkt_cty', 'mkt_brand', 'mkt_showroom'];
  const HN_COMPANY = 'ec6b9c22-1317-4884-a496-cf0793d6c7b8';
  const showKpi = KPI_ROLES.includes(me.role as UserRole) && me.company_id === HN_COMPANY;
  // KPI theo tháng của kỳ đang xem (dùng toMs).
  const kpiDate = new Date(toMs);
  const kpiYear = showKpi ? kpiDate.getUTCFullYear() : 0;
  const kpiMonth = showKpi ? kpiDate.getUTCMonth() + 1 : 0;
  let kpiRows: KpiRow[] = [];
  if (showKpi) {
    const { data: kpiData } = await supabase.rpc('get_kpi_targets', {
      p_company_id: HN_COMPANY, p_year: kpiYear, p_month: kpiMonth,
    });
    kpiRows = (kpiData ?? []) as KpiRow[];
  }

  return (
    <ReportsView
      leads={leads}
      prevLeads={prevLeads}
      sourceCatalog={sourceCatalog}
      range={range}
      from={sp.from ?? ymd(fromMs)}
      to={sp.to ?? ymd(toMs)}
      fromMs={fromMs}
      toMs={toMs}
      showB10={showB10}
      reportLevel={reportLevel}
      models={models}
      showMktPlanning={showMktPlanning}
      kpiRows={kpiRows}
      kpiYear={kpiYear}
      kpiMonth={kpiMonth}
    />
  );
}
