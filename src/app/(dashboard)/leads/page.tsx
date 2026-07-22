import { createClient } from '@/lib/supabase/server';
import { type LeadRow } from './LeadsTable';
import LeadsView, { type ModelOption, type BrandOption, type ShowroomOption, type AssigneeOption, type TeamOption } from './LeadsView';
import { CAN_CREATE_LEAD, CAN_ASSIGN, CAN_MANAGE_STAFF } from '@/lib/nav';
import { getOpenBrandIds, isBrandClosed, getInactiveShowroomIds } from '@/lib/company-brands';
import { resolveCreatorScope } from '@/lib/lead-scope';
import { loadSourceCatalog } from '@/lib/source-catalog';
import { getTenant } from '@/lib/tenant';
import { type UserRole } from '@/types/database';

export const dynamic = 'force-dynamic';

interface RawLead {
  id: string;
  full_name: string | null;
  phone: string;
  source: string | null;
  status: LeadRow['status'];
  created_at: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  last_note: string | null;
  fail_reason: string | null;
  no_answer_count: number | null;
  b10_status: LeadRow['b10_status'];
  b10_synced_at: string | null;
  b10_care_note: string | null;
  brand_id: string;
  model_id: string | null;
  showroom_id: string | null;
  sales_team_id: string | null;
  assigned_to: string | null;
  brand: { name: string } | null;
  model: { name: string } | null;
  showroom: { name: string } | null;
  sales_team: { name: string } | null;
  assignee: { full_name: string } | null;
}

export default async function LeadsPage() {
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

  let leadsQuery = supabase
    .from('leads')
    .select(
      'id, full_name, phone, source, status, created_at, last_contact_at, next_contact_at, last_note, fail_reason, no_answer_count, b10_status, b10_synced_at, b10_care_note, brand_id, model_id, showroom_id, sales_team_id, assigned_to, brand:brands(name), model:models(name), showroom:showrooms(name), sales_team:sales_teams(name), assignee:users!assigned_to(full_name)',
    );
  if (openBrandIds.length) leadsQuery = leadsQuery.in('brand_id', openBrandIds);

  const [
    { data: rawLeads },
    { data: rawModels },
    { data: contactLogs },
    { data: rawBrands },
    { data: rawShowrooms },
    { data: rawAssignees },
    { data: rawTeams },
  ] = await Promise.all([
    leadsQuery
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase.from('models').select('id, name, brand_id').eq('is_active', true).order('sort_order'),
    supabase.from('lead_logs').select('lead_id').eq('type', 'contact'),
    supabase.from('brands').select('id, name').order('name'),
    // .eq('company_id') phòng thủ 2 lớp: RLS đã cô lập tenant (migration 0057), thêm filter
    // ở query để rõ ý định + không phụ thuộc 100% vào RLS nếu sau này đổi client.
    supabase.from('showrooms').select('id, name, is_active').eq('company_id', me?.company_id ?? '').order('name'),
    supabase.from('users').select('id, full_name, showroom_id, sales_team_id').in('role', ['tvbh', 'tn']).eq('is_active', true).order('full_name'),
    supabase.from('sales_teams').select('id, name, showroom_id, brand_ids').eq('company_id', me?.company_id ?? '').order('name'),
  ]);

  // Đếm số lần liên hệ theo lead
  const contactCount: Record<string, number> = {};
  for (const r of (contactLogs ?? []) as { lead_id: string }[]) {
    contactCount[r.lead_id] = (contactCount[r.lead_id] ?? 0) + 1;
  }

  const leads: LeadRow[] = ((rawLeads ?? []) as unknown as RawLead[]).map((l) => ({
    id: l.id,
    full_name: l.full_name,
    phone: l.phone,
    source: l.source,
    status: l.status,
    created_at: l.created_at,
    last_contact_at: l.last_contact_at,
    next_contact_at: l.next_contact_at,
    last_note: l.last_note,
    fail_reason: l.fail_reason,
    no_answer_count: l.no_answer_count ?? 0,
    b10_status: l.b10_status,
    b10_on: l.b10_synced_at != null,
    b10_care_note: l.b10_care_note,
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
    contact_count: contactCount[l.id] ?? 0,
  })).filter((l) => !inactiveSrIds.has(String(l.showroom_id ?? '')));

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

  const sourceCatalog = await loadSourceCatalog(supabase);

  return (
    <LeadsView
      sourceCatalog={sourceCatalog}
      leads={leads}
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
