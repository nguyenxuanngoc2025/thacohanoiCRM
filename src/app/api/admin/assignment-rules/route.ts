import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';

// CRUD assignment_rules (luật phân giao lead cho TVBH)
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    const op = body.op as 'create' | 'update' | 'delete';

    // Cô lập đa công ty: luật sửa/xoá phải thuộc CÙNG công ty với admin.
    if (op === 'update' || op === 'delete') {
      const { data: own } = await service.from('assignment_rules').select('id').eq('id', body.id).eq('company_id', companyId).maybeSingle();
      if (!own) return NextResponse.json({ error: 'Luật phân giao không thuộc công ty của bạn.' }, { status: 404 });
    }

    if (op === 'delete') {
      const { error } = await service.from('assignment_rules').delete().eq('id', body.id).eq('company_id', companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    const strategy = body.strategy === 'specific_user' ? 'specific_user' : 'least_loaded';
    if (strategy === 'specific_user' && !body.specific_user_id) {
      return NextResponse.json({ error: 'Chọn TVBH cụ thể cho luật cố định' }, { status: 400 });
    }
    const row = {
      showroom_id: body.showroom_id || null,
      strategy,
      specific_user_id: strategy === 'specific_user' ? body.specific_user_id : null,
      is_active: body.is_active ?? true,
      priority: Number.isFinite(body.priority) ? body.priority : 0,
    };

    if (op === 'update') {
      const { error } = await service.from('assignment_rules').update(row).eq('id', body.id).eq('company_id', companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    const { data, error } = await service
      .from('assignment_rules')
      .insert({ ...row, company_id: companyId })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
