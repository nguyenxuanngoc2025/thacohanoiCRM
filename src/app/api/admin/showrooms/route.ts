import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { isShowroomQuotaReached, disallowedBrandIds } from '@/lib/quota';

// CRUD showrooms (showroom là địa điểm thuộc 1 công ty; brand_id tuỳ chọn — đa thương hiệu)
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    const op = body.op as 'create' | 'update' | 'delete';

    // Cô lập đa công ty: showroom sửa/xoá phải thuộc CÙNG công ty với admin.
    if (op === 'update' || op === 'delete') {
      const { data: own } = await service.from('showrooms').select('id').eq('id', body.id).eq('company_id', companyId).maybeSingle();
      if (!own) return NextResponse.json({ error: 'Showroom không thuộc công ty của bạn.' }, { status: 404 });
    }

    if (op === 'delete') {
      const { error } = await service.from('showrooms').delete().eq('id', body.id).eq('company_id', companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Thiếu tên showroom' }, { status: 400 });
    const brandIds: string[] = Array.isArray(body.brand_ids)
      ? (body.brand_ids as unknown[]).map((x) => String(x)).filter(Boolean)
      : [];
    const row = {
      name,
      code: body.code ? String(body.code).trim() : null,
    };

    // Brand công ty được cấp (whitelist). Chỉ cho gán brand nằm trong danh sách.
    const { data: allowedRows } = await service
      .from('company_brands')
      .select('brand_id')
      .eq('company_id', companyId);
    const allowedBrandIds = (allowedRows ?? []).map((r) => String((r as { brand_id: string }).brand_id));

    // Đồng bộ bảng junction showroom_brands cho 1 showroom: xoá hết rồi insert lại theo brandIds.
    const syncBrands = async (showroomId: string) => {
      const bad = disallowedBrandIds(brandIds, allowedBrandIds);
      if (bad.length) {
        return 'Có thương hiệu không thuộc gói công ty được cấp. Liên hệ nhà cung cấp để mở thêm.';
      }
      await service.from('showroom_brands').delete().eq('showroom_id', showroomId);
      if (brandIds.length) {
        const { error } = await service
          .from('showroom_brands')
          .insert(brandIds.map((brand_id) => ({ showroom_id: showroomId, brand_id })));
        if (error) return error.message;
      }
      return null;
    };

    if (op === 'update') {
      const { error } = await service.from('showrooms').update(row).eq('id', body.id).eq('company_id', companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      const e = await syncBrands(String(body.id));
      if (e) return NextResponse.json({ error: e }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    // Chặn cứng quota: đếm showroom hiện có của công ty so với max_showrooms.
    const { count: srCount } = await service
      .from('showrooms')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);
    const { data: companyRow } = await service
      .from('companies')
      .select('max_showrooms')
      .eq('id', companyId)
      .maybeSingle();
    const maxSr = Number((companyRow as { max_showrooms: number } | null)?.max_showrooms ?? 0);
    if (isShowroomQuotaReached(srCount ?? 0, maxSr)) {
      return NextResponse.json(
        { error: `Đã đạt giới hạn gói (${maxSr} showroom). Liên hệ nhà cung cấp để nâng gói.` },
        { status: 403 },
      );
    }

    const { data, error } = await service
      .from('showrooms')
      .insert({ ...row, company_id: companyId })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const e = await syncBrands(data.id);
    if (e) return NextResponse.json({ error: e }, { status: 400 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
