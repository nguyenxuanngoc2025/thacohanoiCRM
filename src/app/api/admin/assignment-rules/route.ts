import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';

// CRUD assignment_rules (luật phân giao lead cho TVBH)
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    const op = body.op as 'create' | 'update' | 'delete' | 'set-company-strategy';

    // Cấp 1 (công ty → showroom): ghi chiến lược chia lead vào showroom cho công ty.
    if (op === 'set-company-strategy') {
      if (!['least_loaded', 'round_robin', 'weighted'].includes(body.showroom_assign_strategy)) {
        return NextResponse.json({ error: 'Chiến lược không hợp lệ.' }, { status: 400 });
      }
      const { error } = await service.from('companies')
        .update({ showroom_assign_strategy: body.showroom_assign_strategy }).eq('id', companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

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
    // Cô lập đa công ty: TVBH chỉ định và showroom phải thuộc CÙNG công ty với admin.
    if (strategy === 'specific_user' && body.specific_user_id) {
      const { data: targetUser } = await service.from('users')
        .select('company_id').eq('id', body.specific_user_id).maybeSingle();
      if (!targetUser || targetUser.company_id !== companyId) {
        return NextResponse.json({ error: 'TVBH không thuộc công ty của bạn.' }, { status: 403 });
      }
    }
    if (body.showroom_id) {
      const { data: sr } = await service.from('showrooms')
        .select('id').eq('id', body.showroom_id).eq('company_id', companyId).maybeSingle();
      if (!sr) return NextResponse.json({ error: 'Showroom không thuộc công ty của bạn.' }, { status: 403 });
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
