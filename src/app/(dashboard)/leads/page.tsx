import { createClient } from '@/lib/supabase/server';
import { type LeadRow } from './LeadsTable';
import LeadsView, { type ModelOption, type BrandOption, type ShowroomOption, type AssigneeOption, type TeamOption } from './LeadsView';
import { CAN_CREATE_LEAD, CAN_ASSIGN, CAN_MANAGE_STAFF } from '@/lib/nav';
import { getOpenBrandIds, isBrandClosed, getInactiveShowroomIds } from '@/lib/company-brands';
import { resolveCreatorScope } from '@/lib/lead-scope';
import { loadSourceCatalog } from '@/lib/source-catalog';
import { getTenant } from '@/lib/tenant';
import { type UserRole } from '@/types/database';
import {
  parseLeadsQuery, splitQuery, platformToSources, presetRange, clampPage,
} from '@/lib/leads-query';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const query = parseLeadsQuery(sp);
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from('users').select('role, company_id').eq('id', user.id).maybeSingle()
    : { data: null };
  const canCreate = me?.role ? CAN_CREATE_LEAD.has(me.role as UserRole) : false;
  const canAssign = me?.role ? CAN_ASSIGN.has(me.role as UserRole) : false;
  const canDelete = me?.role ? CAN_MANAGE_STAFF.has(me.role as UserRole) : false;
  const isTvbh = me?.role === 'tvbh';

  // Phạm vi tạo lead theo cấp: giới hạn showroom/hãng/phòng hiện trong form thêm lead.
  const creatorScope = user && canCreate ? await resolveCreatorScope(supabase, user.id) : null;

  const tenant = await getTenant();
  const b10Enabled = tenant?.b10_enabled ?? false;

  // Hãng công ty đang mở (whitelist). Lead của hãng đã đóng bị ẩn khỏi danh sách + KPI.
  const openBrandIds = await getOpenBrandIds(supabase, me?.company_id ?? null);
  // Showroom đang TẮT của công ty → ẩn lead + option showroom/phòng của nó (mirror hãng đóng).
  const inactiveSrIds = new Set(await getInactiveShowroomIds(supabase, me?.company_id ?? null));

  const [
    { data: rawModels },
    { data: rawBrands },
    { data: rawShowrooms },
    { data: rawAssignees },
    { data: rawTeams },
  ] = await Promise.all([
    supabase.from('models').select('id, name, brand_id').eq('is_active', true).order('sort_order'),
    supabase.from('brands').select('id, name').order('name'),
    // .eq('company_id') phòng thủ 2 lớp: RLS đã cô lập tenant (migration 0057), thêm filter
    // ở query để rõ ý định + không phụ thuộc 100% vào RLS nếu sau này đổi client.
    supabase.from('showrooms').select('id, name, is_active').eq('company_id', me?.company_id ?? '').order('name'),
    supabase.from('users').select('id, full_name, showroom_id, sales_team_id').in('role', ['tvbh', 'tn']).eq('is_active', true).order('full_name'),
    supabase.from('sales_teams').select('id, name, showroom_id, brand_ids').eq('company_id', me?.company_id ?? '').order('name'),
  ]);

  // Danh mục nguồn (map platform ↔ value) — cần trước khi gọi RPC để dịch bộ lọc nguồn.
  const sourceCatalog = await loadSourceCatalog(supabase);

  // Lọc/tìm/sắp/tab/phân trang đẩy hết xuống RPC (RLS tự áp scope theo vai trò).
  const rangeMs = presetRange(query.range, Date.now(), query.from, query.to);
  const { digits, text } = splitQuery(query.q);
  const sources = platformToSources(query.source, sourceCatalog);

  const { data: rpc, error: rpcErr } = await supabase.rpc('leads_search_page', {
    p_from: rangeMs ? new Date(rangeMs.fromMs).toISOString() : null,
    p_to: rangeMs ? new Date(rangeMs.toMs).toISOString() : null,
    p_showroom: query.showroom || null,
    p_brand: query.brand || null,
    p_model: query.model || null,
    p_sources: sources,
    p_assignee: query.assignee && query.assignee !== '__none__' ? query.assignee : null,
    p_assignee_none: query.assignee === '__none__',
    p_status: query.status && query.status !== '__none__' ? query.status : null,
    p_status_none: query.status === '__none__',
    p_team: query.team || null,
    p_tab: query.tab,
    p_q_digits: digits,
    p_q_text: text,
    p_open_brands: openBrandIds.length ? openBrandIds : null,
    p_inactive_showrooms: [...inactiveSrIds],
    p_sort: query.sort,
    p_dir: query.dir,
    p_limit: query.size,
    p_offset: (query.page - 1) * query.size,
    p_b10: b10Enabled,
  });
  if (rpcErr) throw new Error(rpcErr.message);

  const result = (rpc ?? { rows: [], total_count: 0, stats: {} }) as {
    rows: LeadRow[];
    total_count: number;
    stats: { total: number; contacted: number; pending: number; rate: number; gdtd: number; b10: number };
  };
  const leads: LeadRow[] = result.rows ?? [];
  const total = result.total_count ?? 0;
  const page = clampPage(query.page, total, query.size);

  // Dropdown tạo/sửa lead: chỉ hiện hãng đang mở (ẩn dòng xe/hãng/phòng của hãng đã tắt).
  const brandClosed = (bid: string | null | undefined) => isBrandClosed(openBrandIds, bid ?? null);
  const models: ModelOption[] = ((rawModels ?? []) as ModelOption[]).filter((m) => !brandClosed(m.brand_id));
  const brands: BrandOption[] = ((rawBrands ?? []) as BrandOption[]).filter((b) => !brandClosed(b.id));
  const showrooms: ShowroomOption[] = ((rawShowrooms ?? []) as (ShowroomOption & { is_active?: boolean })[])
    .filter((s) => s.is_active !== false);
  const assignees: AssigneeOption[] = ((rawAssignees ?? []) as AssigneeOption[]);
  const allTeams: TeamOption[] = ((rawTeams ?? []) as TeamOption[])
    .filter((t) => (t.brand_ids.length === 0 || t.brand_ids.some((b) => !brandClosed(b))) && !inactiveSrIds.has(String(t.showroom_id ?? '')));

  // ── Giới hạn danh sách form THÊM LEAD theo phạm vi người tạo (form ẩn/khoá ô khi 1 lựa chọn).
  // Không ảnh hưởng bộ lọc bảng lead (dùng brands/showrooms/teams gốc). Chỉ dựng bản đã giới hạn.
  const brandAllow = creatorScope?.brandIds ?? null;
  // Showroom cho phép: theo scope showroom, hoặc (scope hãng) các SR có phòng bán ≥1 hãng trong scope.
  let showroomAllow = creatorScope?.showroomIds ?? null;
  if (showroomAllow === null && brandAllow !== null) {
    const brandSet = new Set(brandAllow);
    showroomAllow = [...new Set(
      allTeams.filter((t) => t.brand_ids.some((b) => brandSet.has(b))).map((t) => t.showroom_id),
    )];
  }
  const inScopeBrand = (id: string) => brandAllow === null || brandAllow.includes(id);
  const inScopeSr = (id: string) => showroomAllow === null || showroomAllow.includes(id);

  const formBrands = brands.filter((b) => inScopeBrand(b.id));
  const formShowrooms = showrooms.filter((s) => inScopeSr(s.id));
  const fixedTeamId = creatorScope?.teamId ?? null;
  const formTeams = allTeams.filter((t) =>
    inScopeSr(t.showroom_id)
    && (brandAllow === null || t.brand_ids.some((b) => brandAllow.includes(b)))
    && (!fixedTeamId || t.id === fixedTeamId),
  );

  return (
    <LeadsView
      sourceCatalog={sourceCatalog}
      leads={leads}
      total={total}
      page={page}
      pageSize={query.size}
      stats={result.stats}
      query={query}
      models={models}
      brands={brands}
      showrooms={showrooms}
      assignees={assignees}
      teams={allTeams}
      formBrands={formBrands}
      formShowrooms={formShowrooms}
      formTeams={formTeams}
      fixedTeamId={fixedTeamId}
      canCreate={canCreate}
      canAssign={canAssign}
      canDelete={canDelete}
      b10Enabled={b10Enabled}
      isTvbh={isTvbh}
    />
  );
}
