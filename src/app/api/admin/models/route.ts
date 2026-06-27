import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';

// CRUD dòng xe (models) theo thương hiệu — danh mục dùng chung mọi công ty,
// chỉ Chủ nền tảng (platform_owner) được sửa.
export async function POST(request: NextRequest) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service } = guard.ctx;

  try {
    const body = await request.json();
    const op = body.op as 'create' | 'update' | 'delete';

    if (op === 'delete') {
      const { error } = await service.from('models').delete().eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Thiếu tên dòng xe' }, { status: 400 });
    const brandId = String(body.brand_id ?? '').trim();
    if (!brandId) return NextResponse.json({ error: 'Thiếu thương hiệu' }, { status: 400 });

    const row = {
      brand_id: brandId,
      name,
      sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
      is_active: body.is_active === undefined ? true : !!body.is_active,
    };

    if (op === 'update') {
      const { error } = await service.from('models').update(row).eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    const { data, error } = await service.from('models').insert(row).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
