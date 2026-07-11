import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AssignView, { type UnassignedLead, type TvbhLoad, type AssignTeam } from './AssignView';
import { CAN_ASSIGN } from '@/lib/nav';
import { getOpenBrandIds, getInactiveShowroomIds, isBrandClosed } from '@/lib/company-brands';
import { resolveCreatorScope } from '@/lib/lead-scope';
import { teamInScope } from '@/lib/assign-routing';
import { type AssignStrategy } from '@/lib/assign';
import { type UserRole } from '@/types/database';

export const dynamic = 'force-dynamic';

// Lead đang mở = chưa Fail (kể cả chưa phân loại = NULL)
const OPEN_LEADS = 'status.is.null,status.neq.Fail';

interface RawUnassigned {
  id: string;
  full_name: string | null;
  phone: string;
  source: string | null;
  created_at: string;
  showroom_id: string | null;
  brand_id: string | null;
  sales_team_id: string | null;
  brand: { name: string } | null;
  model: { name: string } | null;
  showroom: { name: string } | null;
}

export default async function AssignPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
  if (!me?.role || !CAN_ASSIGN.has(me.role as UserRole)) redirect('/leads');

  const scope = await resolveCreatorScope(supabase, user.id);

  // Hãng công ty đang mở (whitelist). Lead của hãng đã đóng bị ẩn khỏi hàng chờ + đếm tải.
  const openBrandIds = await getOpenBrandIds(supabase, me?.company_id ?? null);
  const brandClosed = (bid: string | null | undefined) => isBrandClosed(openBrandIds, bid ?? null);
  // Showroom đang TẮT → ẩn lead + TVBH + phòng + đếm tải của nó (mirror hãng đóng).
  const inactiveSrIds = new Set(await getInactiveShowroomIds(supabase, me?.company_id ?? null));
  const srActive = (sid: string | null | undefined) => !inactiveSrIds.has(String(sid ?? ''));

  let unassignedQuery = supabase
    .from('leads')
    .select('id, full_name, phone, source, created_at, showroom_id, brand_id, sales_team_id, brand:brands(name), model:models(name), showroom:showrooms(name)')
    .is('assigned_to', null);
  let openLeadsQuery = supabase
    .from('leads')
    .select('assigned_to, showroom_id')
    .not('assigned_to', 'is', null)
    .or(OPEN_LEADS);
  if (openBrandIds.length) {
    unassignedQuery = unassignedQuery.in('brand_id', openBrandIds);
    openLeadsQuery = openLeadsQuery.in('brand_id', openBrandIds);
  }

  const [
    { data: rawUnassigned },
    { data: rawTvbh },
    { data: openLeads },
    { data: rawTeams },
  ] = await Promise.all([
    unassignedQuery
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('users')
      .select('id, full_name, showroom_id, sales_team_id, assign_share_pct, showroom:showrooms!showroom_id(name), sales_team:sales_teams!sales_team_id(name)')
      .eq('role', 'tvbh')
      .eq('is_active', true)
      .order('full_name'),
    openLeadsQuery,
    supabase
      .from('sales_teams')
      .select('id, name, showroom_id, brand_ids, team_assign_strategy, showroom:showrooms!showroom_id(name)')
      .order('name'),
  ]);

  // Đếm lead đang mở theo TVBH (bỏ lead thuộc showroom tắt)
  const loadMap: Record<string, number> = {};
  for (const r of (openLeads ?? []) as { assigned_to: string; showroom_id: string | null }[]) {
    if (!srActive(r.showroom_id)) continue;
    loadMap[r.assigned_to] = (loadMap[r.assigned_to] ?? 0) + 1;
  }

  // Phòng trong phạm vi UI: showroom đang bật + có bán ≥1 hãng đang mở (hoặc chưa gán hãng)
  // + nằm trong phạm vi người xem (tp_phong chỉ thấy phòng mình).
  const teams: AssignTeam[] = ((rawTeams ?? []) as unknown as {
    id: string; name: string; showroom_id: string | null; brand_ids: string[] | null;
    team_assign_strategy: string | null; showroom: { name: string } | null;
  }[])
    .filter((t) => srActive(t.showroom_id))
    .filter((t) => {
      const bids = t.brand_ids ?? [];
      return bids.length === 0 || bids.some((b) => !brandClosed(b));
    })
    .filter((t) => !scope || teamInScope(
      { showroomIds: scope.showroomIds, brandIds: scope.brandIds, teamId: scope.teamId },
      { id: t.id, showroom_id: t.showroom_id, brand_ids: t.brand_ids ?? [] },
    ))
    .map((t) => ({
      id: t.id,
      name: t.name,
      showroom_id: t.showroom_id,
      showroom_name: t.showroom?.name ?? null,
      brand_ids: t.brand_ids ?? [],
      team_assign_strategy: (t.team_assign_strategy as AssignStrategy | null) ?? 'least_loaded',
    }));

  // TVBH chỉ hiện nếu thuộc phòng trong phạm vi (mirror lọc phòng ở trên).
  const allowedTeamIds = new Set(teams.map((t) => t.id));
  const tvbh: TvbhLoad[] = ((rawTvbh ?? []) as unknown as {
    id: string; full_name: string; showroom_id: string | null; sales_team_id: string | null;
    assign_share_pct: number | null; showroom: { name: string } | null; sales_team: { name: string } | null;
  }[])
    .filter((t) => srActive(t.showroom_id))
    .filter((t) => t.sales_team_id != null && allowedTeamIds.has(t.sales_team_id))
    .map((t) => ({
    id: t.id,
    full_name: t.full_name,
    showroom_id: t.showroom_id,
    showroom_name: t.showroom?.name ?? null,
    sales_team_id: t.sales_team_id,
    team_name: t.sales_team?.name ?? null,
    share_pct: t.assign_share_pct ?? 0,
    open_count: loadMap[t.id] ?? 0,
  }));

  const leads: UnassignedLead[] = ((rawUnassigned ?? []) as unknown as RawUnassigned[])
    .filter((l) => srActive(l.showroom_id))
    .map((l) => ({
      id: l.id,
      full_name: l.full_name,
      phone: l.phone,
      source: l.source,
      created_at: l.created_at,
      showroom_id: l.showroom_id,
      brand_id: l.brand_id,
      sales_team_id: l.sales_team_id,
      brand_name: l.brand?.name ?? '—',
      model_name: l.model?.name ?? null,
      showroom_name: l.showroom?.name ?? null,
    }));

  return (
    <AssignView
      leads={leads}
      tvbh={tvbh}
      teams={teams}
      scope={{
        kind: scope?.kind ?? 'company',
        showroomIds: scope?.showroomIds ?? null,
        brandIds: scope?.brandIds ?? null,
        teamId: scope?.teamId ?? null,
      }}
    />
  );
}
