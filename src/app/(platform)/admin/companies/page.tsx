import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentRole } from '@/lib/platform-guard';
import CompaniesManager from '@/components/platform/CompaniesManager';
import type { PlatformCompany, PlatformBrand } from '@/components/platform/types';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  const role = await getCurrentRole();
  if (role !== 'platform_owner') redirect('/leads');

  const service = createServiceClient();
  const [{ data: companies }, { data: showrooms }, { data: cbRows }, { data: users }, { data: brands }] =
    await Promise.all([
      service.from('companies').select('id,name,slug,subdomain,custom_domain,plan_status,max_showrooms,b10_enabled').order('name'),
      service.from('showrooms').select('id,company_id,is_active'),
      service.from('company_brands').select('company_id,brand_id'),
      service.from('users').select('id,company_id'),
      service.from('brands').select('id,name,slug').order('name'),
    ]);

  const srCount: Record<string, number> = {};
  const srInactive: Record<string, number> = {};
  for (const s of (showrooms ?? []) as { company_id: string | null; is_active: boolean }[]) {
    if (!s.company_id) continue;
    if (s.is_active === false) srInactive[s.company_id] = (srInactive[s.company_id] ?? 0) + 1;
    else srCount[s.company_id] = (srCount[s.company_id] ?? 0) + 1;
  }
  const brandIdsByCompany: Record<string, string[]> = {};
  for (const r of (cbRows ?? []) as { company_id: string; brand_id: string }[]) {
    (brandIdsByCompany[r.company_id] ??= []).push(r.brand_id);
  }
  const userCount: Record<string, number> = {};
  for (const u of (users ?? []) as { company_id: string | null }[]) {
    if (u.company_id) userCount[u.company_id] = (userCount[u.company_id] ?? 0) + 1;
  }

  const rows: PlatformCompany[] = ((companies ?? []) as (Omit<PlatformCompany, 'showroom_used' | 'showroom_inactive' | 'user_count' | 'brand_ids' | 'b10_enabled'> & { b10_enabled: boolean | null })[])
    .map((c) => ({
      ...c,
      b10_enabled: c.b10_enabled ?? false,
      showroom_used: srCount[c.id] ?? 0,
      showroom_inactive: srInactive[c.id] ?? 0,
      user_count: userCount[c.id] ?? 0,
      brand_ids: brandIdsByCompany[c.id] ?? [],
    }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Công ty</h1>
        <p className="text-sm text-slate-400 mt-0.5">Quản lý quota &amp; trạng thái từng công ty</p>
      </div>
      <CompaniesManager companies={rows} brands={(brands ?? []) as PlatformBrand[]} />
    </div>
  );
}
