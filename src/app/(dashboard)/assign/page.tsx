import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AssignView, { type UnassignedLead, type TvbhLoad } from './AssignView';
import { CAN_ASSIGN } from '@/lib/nav';
import { getOpenBrandIds } from '@/lib/company-brands';
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

  // Hãng công ty đang mở (whitelist). Lead của hãng đã đóng bị ẩn khỏi hàng chờ + đếm tải.
  const openBrandIds = await getOpenBrandIds(supabase, me?.company_id ?? null);

  let unassignedQuery = supabase
    .from('leads')
    .select('id, full_name, phone, source, created_at, showroom_id, brand:brands(name), model:models(name), showroom:showrooms(name)')
    .is('assigned_to', null);
  let openLeadsQuery = supabase
    .from('leads')
    .select('assigned_to')
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
  ] = await Promise.all([
    unassignedQuery
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('users')
      .select('id, full_name, showroom_id, showroom:showrooms!showroom_id(name)')
      .eq('role', 'tvbh')
      .eq('is_active', true)
      .order('full_name'),
    openLeadsQuery,
  ]);

  // Đếm lead đang mở theo TVBH
  const loadMap: Record<string, number> = {};
  for (const r of (openLeads ?? []) as { assigned_to: string }[]) {
    loadMap[r.assigned_to] = (loadMap[r.assigned_to] ?? 0) + 1;
  }

  const tvbh: TvbhLoad[] = ((rawTvbh ?? []) as unknown as {
    id: string; full_name: string; showroom_id: string | null; showroom: { name: string } | null;
  }[]).map((t) => ({
    id: t.id,
    full_name: t.full_name,
    showroom_id: t.showroom_id,
    showroom_name: t.showroom?.name ?? null,
    open_count: loadMap[t.id] ?? 0,
  }));

  const leads: UnassignedLead[] = ((rawUnassigned ?? []) as unknown as RawUnassigned[]).map((l) => ({
    id: l.id,
    full_name: l.full_name,
    phone: l.phone,
    source: l.source,
    created_at: l.created_at,
    showroom_id: l.showroom_id,
    brand_name: l.brand?.name ?? '—',
    model_name: l.model?.name ?? null,
    showroom_name: l.showroom?.name ?? null,
  }));

  return <AssignView leads={leads} tvbh={tvbh} />;
}
