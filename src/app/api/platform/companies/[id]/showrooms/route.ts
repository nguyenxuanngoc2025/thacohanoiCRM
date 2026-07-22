import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';
import { writeAudit } from '@/lib/platform-audit';
import { isShowroomQuotaReached, disallowedBrandIds } from '@/lib/quota';
import type { createServiceClient } from '@/lib/supabase/server';

type Service = ReturnType<typeof createServiceClient>;

// Đồng bộ junction showroom_brands: xoá hết rồi insert lại theo brandIds.
// Chỉ cho gán brand nằm trong whitelist công ty được cấp (company_brands).
async function syncBrands(
  service: Service,
  companyId: string,
  showroomId: string,
  brandIds: string[],
): Promise<string | null> {
  const { data: allowedRows } = await service
    .from('company_brands').select('brand_id').eq('company_id', companyId);
  const allowedBrandIds = (allowedRows ?? []).map((r) => String((r as { brand_id: string }).brand_id));
  const bad = disallowedBrandIds(brandIds, allowedBrandIds);
  if (bad.length) return 'Có thương hiệu không thuộc gói công ty được cấp.';
  await service.from('showroom_brands').delete().eq('showroom_id', showroomId);
  if (brandIds.length) {
    const { error } = await service
      .from('showroom_brands')
      .insert(brandIds.map((brand_id) => ({ showroom_id: showroomId, brand_id })));
    if (error) return error.message;
  }
  return null;
}

const normBrandIds = (v: unknown): string[] =>
  Array.isArray(v) ? (v as unknown[]).map((x) => String(x)).filter(Boolean) : [];

// Từ khoá tỉnh (không dấu/viết tắt): nhận mảng HOẶC chuỗi phân tách bởi dấu phẩy/xuống dòng.
const normAliases = (v: unknown): string[] => {
  const arr = Array.isArray(v)
    ? (v as unknown[]).map((x) => String(x))
    : typeof v === 'string' ? v.split(/[,\n]/) : [];
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
};

// POST /api/platform/companies/:id/showrooms — tạo showroom mới cho công ty (chặn quota).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service, userId } = guard.ctx;
  const { id: companyId } = await params;

  try {
    const body = await request.json() as { name?: string; code?: string; brand_ids?: unknown; province?: unknown; province_aliases?: unknown };
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Thiếu tên showroom.' }, { status: 400 });
    const brandIds = normBrandIds(body.brand_ids);

    // Chặn cứng quota: đếm showroom hiện có so với max_showrooms.
    const { count: srCount } = await service
      .from('showrooms').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    const { data: companyRow } = await service
      .from('companies').select('max_showrooms').eq('id', companyId).maybeSingle();
    const maxSr = Number((companyRow as { max_showrooms: number } | null)?.max_showrooms ?? 0);
    if (isShowroomQuotaReached(srCount ?? 0, maxSr)) {
      return NextResponse.json(
        { error: `Đã đạt giới hạn gói (${maxSr} showroom). Nâng quota trước khi thêm.` },
        { status: 403 },
      );
    }

    const { data, error } = await service
      .from('showrooms')
      .insert({
        name, code: body.code ? String(body.code).trim() : null, company_id: companyId,
        province: body.province ? String(body.province).trim() : null,
        province_aliases: normAliases(body.province_aliases),
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const e = await syncBrands(service, companyId, data.id, brandIds);
    if (e) return NextResponse.json({ error: e }, { status: 400 });

    await writeAudit(service, userId, 'showroom.create', 'showroom', data.id,
      { company_id: companyId, name });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH /api/platform/companies/:id/showrooms — bật/tắt HOẶC sửa tên/mã/brand 1 showroom.
// Chỉ platform_owner. Kiểm tra showroom thuộc ĐÚNG công ty (chống đổi showroom công ty khác).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service, userId } = guard.ctx;
  const { id: companyId } = await params;

  try {
    const body = await request.json() as {
      showroom_id?: string; is_active?: boolean; name?: string; code?: string; brand_ids?: unknown;
      province?: unknown; province_aliases?: unknown;
    };
    const showroomId = (body.showroom_id ?? '').trim();
    if (!showroomId) return NextResponse.json({ error: 'Thiếu showroom_id.' }, { status: 400 });

    // Cô lập: showroom phải thuộc đúng công ty trong URL.
    const { data: sr } = await service
      .from('showrooms').select('id, company_id, name').eq('id', showroomId).maybeSingle();
    if (!sr || String((sr as { company_id: string }).company_id) !== companyId) {
      return NextResponse.json({ error: 'Showroom không thuộc công ty này.' }, { status: 404 });
    }

    // Nhánh bật/tắt (is_active gửi lên = toggle thuần).
    if (typeof body.is_active === 'boolean') {
      const { error } = await service
        .from('showrooms').update({ is_active: body.is_active }).eq('id', showroomId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await writeAudit(service, userId, body.is_active ? 'showroom.activate' : 'showroom.deactivate',
        'showroom', showroomId, { company_id: companyId, name: (sr as { name: string }).name });
      return NextResponse.json({ success: true });
    }

    // Nhánh sửa thông tin: tên/mã/brand.
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Thiếu tên showroom.' }, { status: 400 });
    const brandIds = normBrandIds(body.brand_ids);

    const { error } = await service
      .from('showrooms')
      .update({
        name, code: body.code ? String(body.code).trim() : null,
        province: body.province ? String(body.province).trim() : null,
        province_aliases: normAliases(body.province_aliases),
      })
      .eq('id', showroomId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const e = await syncBrands(service, companyId, showroomId, brandIds);
    if (e) return NextResponse.json({ error: e }, { status: 400 });

    await writeAudit(service, userId, 'showroom.update', 'showroom', showroomId,
      { company_id: companyId, name });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE /api/platform/companies/:id/showrooms — xoá vĩnh viễn 1 showroom.
// Chặn xoá khi còn lead hoặc nhân sự gắn showroom (báo lỗi, gợi ý Tắt thay vì xoá).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service, userId } = guard.ctx;
  const { id: companyId } = await params;

  try {
    const body = await request.json() as { showroom_id?: string };
    const showroomId = (body.showroom_id ?? '').trim();
    if (!showroomId) return NextResponse.json({ error: 'Thiếu showroom_id.' }, { status: 400 });

    // Cô lập: showroom phải thuộc đúng công ty trong URL.
    const { data: sr } = await service
      .from('showrooms').select('id, company_id, name').eq('id', showroomId).maybeSingle();
    if (!sr || String((sr as { company_id: string }).company_id) !== companyId) {
      return NextResponse.json({ error: 'Showroom không thuộc công ty này.' }, { status: 404 });
    }

    // Chặn xoá nếu còn lead / nhân sự.
    const [{ count: leadCount }, { count: staffCount }] = await Promise.all([
      service.from('leads').select('id', { count: 'exact', head: true }).eq('showroom_id', showroomId),
      service.from('users').select('id', { count: 'exact', head: true }).eq('showroom_id', showroomId),
    ]);
    const nLead = leadCount ?? 0;
    const nStaff = staffCount ?? 0;
    if (nLead > 0 || nStaff > 0) {
      return NextResponse.json(
        { error: `Còn ${nLead} lead / ${nStaff} nhân sự gắn showroom — hãy Tắt thay vì xoá.` },
        { status: 400 },
      );
    }

    await service.from('showroom_brands').delete().eq('showroom_id', showroomId);
    const { error } = await service.from('showrooms').delete().eq('id', showroomId).eq('company_id', companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await writeAudit(service, userId, 'showroom.delete', 'showroom', showroomId,
      { company_id: companyId, name: (sr as { name: string }).name });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
