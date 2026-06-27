import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';
import { usernameToEmail } from '@/lib/account-email';
import { writeAudit } from '@/lib/platform-audit';

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

// POST /api/platform/companies — tạo công ty mới + tài khoản admin đầu tiên
export async function POST(request: NextRequest) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service, userId } = guard.ctx;

  try {
    const body = await request.json() as {
      name?: string; subdomain?: string; max_showrooms?: number; brand_ids?: string[];
      admin_username?: string; admin_password?: string; admin_full_name?: string;
    };
    const name = (body.name ?? '').trim();
    const subdomain = (body.subdomain ?? '').trim().toLowerCase();
    const adminEmail = usernameToEmail(body.admin_username ?? '');
    const adminFullName = (body.admin_full_name ?? '').trim();
    const adminPassword = body.admin_password ?? '';
    const maxSr = Math.max(0, Math.floor(body.max_showrooms ?? 0));
    const brandIds = (body.brand_ids ?? []).map((x) => String(x)).filter(Boolean);

    if (!name || !subdomain) {
      return NextResponse.json({ error: 'Vui lòng nhập tên công ty và subdomain.' }, { status: 400 });
    }
    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      return NextResponse.json({ error: 'Subdomain chỉ gồm chữ thường, số và dấu gạch ngang.' }, { status: 400 });
    }
    if (!adminEmail || !adminPassword || !adminFullName) {
      return NextResponse.json({ error: 'Vui lòng nhập đủ tên đăng nhập, mật khẩu và họ tên admin.' }, { status: 400 });
    }
    if (adminPassword.length < 6) {
      return NextResponse.json({ error: 'Mật khẩu admin tối thiểu 6 ký tự.' }, { status: 400 });
    }

    // 1) Tạo công ty (slug = subdomain để đảm bảo duy nhất)
    const { data: company, error: cErr } = await service
      .from('companies')
      .insert({ name, slug: subdomain, subdomain, plan_status: 'active', max_showrooms: maxSr })
      .select('id')
      .single();
    if (cErr || !company) {
      const dup = cErr?.code === '23505';
      return NextResponse.json(
        { error: dup ? 'Subdomain này đã được dùng cho công ty khác.' : (cErr?.message ?? 'Không tạo được công ty.') },
        { status: 400 },
      );
    }
    const companyId = company.id as string;

    // 2) Whitelist thương hiệu
    if (brandIds.length) {
      const { error } = await service
        .from('company_brands')
        .insert(brandIds.map((brand_id) => ({ company_id: companyId, brand_id })));
      if (error) {
        await service.from('companies').delete().eq('id', companyId);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    // 3) Tạo tài khoản admin (GoTrue admin API)
    const { data: authData, error: authErr } = await service.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { app: 'crm', full_name: adminFullName },
    });
    if (authErr || !authData?.user?.id) {
      await service.from('company_brands').delete().eq('company_id', companyId);
      await service.from('companies').delete().eq('id', companyId);
      return NextResponse.json(
        { error: authErr?.message ?? 'Không tạo được tài khoản admin (tên đăng nhập có thể đã tồn tại).' },
        { status: 400 },
      );
    }
    const adminId = authData.user.id;

    // 4) Hồ sơ admin trong CRM
    const { error: pErr } = await service.from('users').insert({
      id: adminId,
      email: adminEmail,
      full_name: adminFullName,
      role: 'admin',
      company_id: companyId,
      is_active: true,
    });
    if (pErr) {
      await service.auth.admin.deleteUser(adminId);
      await service.from('company_brands').delete().eq('company_id', companyId);
      await service.from('companies').delete().eq('id', companyId);
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    await writeAudit(service, userId, 'company.create', 'company', companyId, {
      name, subdomain, max_showrooms: maxSr, brand_count: brandIds.length, admin_email: adminEmail,
    });

    return NextResponse.json({ success: true, companyId, adminEmail });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH /api/platform/companies — cập nhật quota / plan_status / brands của 1 công ty
export async function PATCH(request: NextRequest) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service, userId } = guard.ctx;

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

    // Nhật ký: phân biệt khóa/mở với đổi quota để dễ đọc.
    const action = body.plan_status === 'suspended' ? 'company.suspend'
      : body.plan_status === 'active' ? 'company.activate'
      : 'company.quota';
    await writeAudit(service, userId, action, 'company', body.id, {
      max_showrooms: patch.max_showrooms, plan_status: patch.plan_status,
      brand_ids: Array.isArray(body.brand_ids) ? body.brand_ids.length : undefined,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
