import { NextResponse, type NextRequest } from 'next/server';
import { requireAssignManager, showroomInScope, type AssignManagerContext } from '@/lib/assign-guard';
import { resetEffectiveFromForShowroom } from '@/lib/assign-effective';

// CRUD phòng bán hàng (sales_teams) + chiến lược chia TVBH + % share phòng.
// op: create | update | delete | set-allocation (cũ) | set-strategy
// Chỉ 'set-strategy' mở cho gd_showroom (theo phạm vi); các op còn lại chỉ admin.
export async function POST(request: NextRequest) {
  const guard = await requireAssignManager();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    const op = body.op as 'create' | 'update' | 'delete' | 'set-allocation' | 'set-strategy';

    // gd_showroom (showroomIds !== null) chỉ được đổi kiểu chia phòng→TVBH + % (set-strategy).
    if (guard.ctx.showroomIds !== null && op !== 'set-strategy') {
      return NextResponse.json({ error: 'Chỉ quản trị công ty được thao tác này.' }, { status: 403 });
    }

    // Cô lập đa công ty: phòng sửa/xoá/đặt tỷ trọng phải thuộc CÙNG công ty với caller.
    if (op === 'update' || op === 'delete' || op === 'set-allocation' || op === 'set-strategy') {
      const { data: own } = await service.from('sales_teams')
        .select('id, is_default, showroom_id').eq('id', body.id ?? body.sales_team_id).eq('company_id', companyId).maybeSingle();
      if (!own) return NextResponse.json({ error: 'Phòng bán hàng không thuộc công ty của bạn.' }, { status: 404 });
      // Phạm vi: gd_showroom chỉ được đụng phòng thuộc showroom mình phụ trách.
      if (!showroomInScope(guard.ctx, own.showroom_id)) {
        return NextResponse.json({ error: 'Phòng không thuộc showroom bạn phụ trách.' }, { status: 403 });
      }

      if (op === 'delete') {
        if (own.is_default) {
          return NextResponse.json({ error: 'Không thể xoá phòng mặc định của showroom.' }, { status: 400 });
        }
        // Còn TVBH hoặc lead gắn phòng → không cho xoá để tránh mất liên kết.
        const { count: userCount } = await service.from('users')
          .select('id', { count: 'exact', head: true }).eq('sales_team_id', own.id);
        if ((userCount ?? 0) > 0) {
          return NextResponse.json({ error: 'Phòng còn nhân sự — chuyển nhân sự sang phòng khác trước khi xoá.' }, { status: 400 });
        }
        const { count: leadCount } = await service.from('leads')
          .select('id', { count: 'exact', head: true }).eq('sales_team_id', own.id);
        if ((leadCount ?? 0) > 0) {
          return NextResponse.json({ error: 'Phòng còn lead — không thể xoá.' }, { status: 400 });
        }
        const { error } = await service.from('sales_teams').delete().eq('id', own.id).eq('company_id', companyId);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ success: true });
      }
    }

    if (op === 'set-strategy') {
      const updates: Record<string, unknown> = {};
      if (['least_loaded', 'round_robin', 'weighted', 'manual'].includes(body.tvbh_assign_strategy)) {
        updates.tvbh_assign_strategy = body.tvbh_assign_strategy;
      }
      if (Number.isFinite(Number(body.assign_share_pct))) {
        updates.assign_share_pct = Math.max(0, Number(body.assign_share_pct));
      }
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Không có thay đổi nào.' }, { status: 400 });
      }
      const { error } = await service.from('sales_teams').update(updates).eq('id', body.sales_team_id).eq('company_id', companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      // Đổi % / kiểu chia cấp 2-3 → đặt lại mốc hiệu lực để có tác dụng ngay (không bị lead cũ kéo lệch).
      const { data: t } = await service.from('sales_teams').select('showroom_id').eq('id', body.sales_team_id).maybeSingle();
      await resetEffectiveFromForShowroom(service, t?.showroom_id);
      return NextResponse.json({ success: true });
    }

    if (op === 'set-allocation') {
      const teamId = body.sales_team_id as string;
      const allocations = (body.allocations ?? {}) as Record<string, number>;
      // Thay toàn bộ cấu hình tỷ trọng của phòng: xoá cũ → chèn mới (chỉ weight hợp lệ ≥ 0).
      await service.from('team_allocation').delete().eq('sales_team_id', teamId);
      const rows = Object.entries(allocations)
        .filter(([ch, w]) => ch.trim() && Number.isFinite(Number(w)) && Number(w) >= 0)
        .map(([ch, w]) => ({ sales_team_id: teamId, channel: ch.trim().toLowerCase(), weight: Number(w) }));
      if (rows.length > 0) {
        const { error } = await service.from('team_allocation').insert(rows);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    if (op === 'update') {
      const own = await service.from('sales_teams')
        .select('showroom_id').eq('id', body.id).eq('company_id', companyId).maybeSingle();
      const updates: Record<string, unknown> = {};
      if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
      if (body.head_user_id !== undefined) updates.head_user_id = body.head_user_id || null;
      if (Number.isFinite(body.sort_order)) updates.sort_order = body.sort_order;
      // Đổi TẬP thương hiệu phòng (kể cả phòng mặc định). brand_ids = [] → phòng chưa gán hãng,
      // KHÔNG nhận lead. Mỗi hãng phải là hãng showroom thực sự kinh doanh (chọn tay, không tự lan).
      if (body.brand_ids !== undefined) {
        const brandIds = await validateBrandIds(service, own.data?.showroom_id, body.brand_ids);
        if (brandIds.error) return brandIds.error;
        updates.brand_ids = brandIds.ids;
      }
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Không có thay đổi nào.' }, { status: 400 });
      }
      const { error } = await service.from('sales_teams').update(updates).eq('id', body.id).eq('company_id', companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    // op === 'create'
    const name = (body.name as string)?.trim();
    const showroomId = body.showroom_id as string;
    if (!name || !showroomId) {
      return NextResponse.json({ error: 'Thiếu tên phòng hoặc showroom.' }, { status: 400 });
    }
    // Showroom phải thuộc công ty admin.
    const { data: sr } = await service.from('showrooms').select('id').eq('id', showroomId).eq('company_id', companyId).maybeSingle();
    if (!sr) return NextResponse.json({ error: 'Showroom không thuộc công ty của bạn.' }, { status: 400 });
    // brand_ids = TẬP hãng phòng bán (mỗi hãng phải là hãng showroom thực sự kinh doanh).
    // [] hợp lệ → phòng chưa gán hãng, sẽ không nhận lead cho tới khi cấu hình.
    const brandIds = await validateBrandIds(service, showroomId, body.brand_ids);
    if (brandIds.error) return brandIds.error;

    const { data, error } = await service.from('sales_teams')
      .insert({
        company_id: companyId,
        showroom_id: showroomId,
        brand_ids: brandIds.ids,
        name,
        head_user_id: body.head_user_id || null,
        is_default: false,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Chuẩn hoá + kiểm tra tập hãng: bỏ trùng, mỗi hãng phải là hãng showroom kinh doanh.
async function validateBrandIds(
  service: AssignManagerContext['service'],
  showroomId: string | undefined | null,
  raw: unknown,
): Promise<{ ids: string[]; error?: never } | { ids?: never; error: NextResponse }> {
  const ids = Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === 'string' && !!x))] : [];
  if (ids.length === 0) return { ids: [] };
  if (!showroomId) return { error: NextResponse.json({ error: 'Không xác định được showroom.' }, { status: 400 }) };
  const { data: sb } = await service.from('showroom_brands')
    .select('brand_id').eq('showroom_id', showroomId).in('brand_id', ids);
  const valid = new Set((sb ?? []).map((r: { brand_id: string }) => r.brand_id));
  if (ids.some((id) => !valid.has(id))) {
    return { error: NextResponse.json({ error: 'Có thương hiệu không thuộc showroom này.' }, { status: 400 }) };
  }
  return { ids };
}
