import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';

// GET /api/platform/companies — danh sách công ty + quota + usage + brand được cấp
export async function GET() {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service } = guard.ctx;

  const [{ data: companies }, { data: showrooms }, { data: cbRows }, { data: users }, { data: brands }] =
    await Promise.all([
      service.from('companies').select('id,name,slug,subdomain,custom_domain,plan_status,max_showrooms').order('name'),
      service.from('showrooms').select('id,company_id'),
      service.from('company_brands').select('company_id,brand_id'),
      service.from('users').select('id,company_id,is_active'),
      service.from('brands').select('id,name,slug').order('name'),
    ]);

  const srCount: Record<string, number> = {};
  for (const s of (showrooms ?? []) as { company_id: string | null }[]) {
    if (s.company_id) srCount[s.company_id] = (srCount[s.company_id] ?? 0) + 1;
  }
  const brandIdsByCompany: Record<string, string[]> = {};
  for (const r of (cbRows ?? []) as { company_id: string; brand_id: string }[]) {
    (brandIdsByCompany[r.company_id] ??= []).push(r.brand_id);
  }
  const userCount: Record<string, number> = {};
  for (const u of (users ?? []) as { company_id: string | null }[]) {
    if (u.company_id) userCount[u.company_id] = (userCount[u.company_id] ?? 0) + 1;
  }

  const rows = ((companies ?? []) as {
    id: string; name: string; slug: string; subdomain: string | null;
    custom_domain: string | null; plan_status: string; max_showrooms: number;
  }[]).map((c) => ({
    ...c,
    showroom_used: srCount[c.id] ?? 0,
    user_count: userCount[c.id] ?? 0,
    brand_ids: brandIdsByCompany[c.id] ?? [],
  }));

  return NextResponse.json({ companies: rows, brands: brands ?? [] });
}

// PATCH /api/platform/companies — cập nhật quota / plan_status / brands của 1 công ty
export async function PATCH(request: NextRequest) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service } = guard.ctx;

  try {
    const body = await request.json() as {
      id: string;
      max_showrooms?: number;
      plan_status?: 'active' | 'suspended' | 'trial';
      brand_ids?: string[];
    };
    if (!body.id) return NextResponse.json({ error: 'Thiếu id công ty' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof body.max_showrooms === 'number') {
      patch.max_showrooms = Math.max(0, Math.floor(body.max_showrooms));
    }
    if (body.plan_status && ['active', 'suspended', 'trial'].includes(body.plan_status)) {
      patch.plan_status = body.plan_status;
    }
    if (Object.keys(patch).length) {
      const { error } = await service.from('companies').update(patch).eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Đồng bộ whitelist brand: xoá hết rồi insert lại theo brand_ids gửi lên.
    if (Array.isArray(body.brand_ids)) {
      const ids = body.brand_ids.map((x) => String(x)).filter(Boolean);
      await service.from('company_brands').delete().eq('company_id', body.id);
      if (ids.length) {
        const { error } = await service
          .from('company_brands')
          .insert(ids.map((brand_id) => ({ company_id: body.id, brand_id })));
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
