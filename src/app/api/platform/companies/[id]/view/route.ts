import { NextResponse } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';

// GET /api/platform/companies/:id/view — snapshot read-only dữ liệu 1 công ty (xem-as)
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service } = guard.ctx;
  const { id } = await params;

  const { data: company } = await service.from('companies')
    .select('id,name,subdomain,plan_status,max_showrooms')
    .eq('id', id).single();
  if (!company) return NextResponse.json({ error: 'Không tìm thấy công ty.' }, { status: 404 });

  const [{ data: showrooms }, { data: users }, { data: leads }] = await Promise.all([
    service.from('showrooms').select('id,name,code,is_active,province,province_aliases').eq('company_id', id).order('name'),
    service.from('users').select('id,full_name,email,role,is_active').eq('company_id', id).order('full_name'),
    service.from('leads')
      .select('id,full_name,phone,status,source,created_at,showroom_id')
      .eq('company_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Đếm lead theo trạng thái (toàn bộ công ty, không chỉ 30 dòng gần nhất)
  const { data: allLeadStatus } = await service.from('leads').select('status').eq('company_id', id);
  const statusCount: Record<string, number> = {};
  for (const l of (allLeadStatus ?? []) as { status: string }[]) {
    statusCount[l.status] = (statusCount[l.status] ?? 0) + 1;
  }

  // Brand đã gán cho từng showroom (để mở modal sửa showroom bên platform admin).
  const srIds = (showrooms ?? []).map((s) => (s as { id: string }).id);
  const { data: srBrandRows } = srIds.length
    ? await service.from('showroom_brands').select('showroom_id, brand_id').in('showroom_id', srIds)
    : { data: [] as { showroom_id: string; brand_id: string }[] };
  const brandIdsBySr: Record<string, string[]> = {};
  for (const r of (srBrandRows ?? []) as { showroom_id: string; brand_id: string }[]) {
    (brandIdsBySr[r.showroom_id] ??= []).push(r.brand_id);
  }
  const showroomsOut = ((showrooms ?? []) as {
    id: string; name: string; code: string | null; is_active: boolean;
    province: string | null; province_aliases: string[] | null;
  }[])
    .map((s) => ({ ...s, province_aliases: s.province_aliases ?? [], brand_ids: brandIdsBySr[s.id] ?? [] }));

  const srName: Record<string, string> = {};
  for (const s of (showrooms ?? []) as { id: string; name: string }[]) srName[s.id] = s.name;

  const recentLeads = ((leads ?? []) as {
    id: string; full_name: string | null; phone: string; status: string;
    source: string | null; created_at: string; showroom_id: string | null;
  }[]).map((l) => ({
    id: l.id,
    full_name: l.full_name,
    phone: l.phone,
    status: l.status,
    source: l.source,
    created_at: l.created_at,
    showroom_name: l.showroom_id ? (srName[l.showroom_id] ?? null) : null,
  }));

  return NextResponse.json({
    company,
    showrooms: showroomsOut,
    users: users ?? [],
    leadTotal: (allLeadStatus ?? []).length,
    statusCount,
    recentLeads,
  });
}
