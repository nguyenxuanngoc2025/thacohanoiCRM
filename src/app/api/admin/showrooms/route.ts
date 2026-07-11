import { NextResponse, type NextRequest } from 'next/server';
import { requireAssignManager, showroomInScope } from '@/lib/assign-guard';

// Cập nhật chiến lược phân giao của showroom (kiểu chia lead vào phòng + % share).
// Tên/mã/thương hiệu + tạo/xoá showroom do Chủ nền tảng quản lý bên trang admin.
// Cho admin (toàn công ty) + gd_showroom (chỉ showroom mình phụ trách).
export async function POST(request: NextRequest) {
  const guard = await requireAssignManager();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    if (body.op !== 'update') {
      return NextResponse.json({ error: 'Chỉ hỗ trợ cập nhật chiến lược phân giao.' }, { status: 400 });
    }

    // Cô lập đa công ty: showroom phải thuộc CÙNG công ty với caller.
    const { data: own } = await service
      .from('showrooms').select('id').eq('id', body.id).eq('company_id', companyId).maybeSingle();
    if (!own) return NextResponse.json({ error: 'Showroom không thuộc công ty của bạn.' }, { status: 404 });
    // Phạm vi: gd_showroom chỉ được đụng showroom mình phụ trách.
    if (!showroomInScope(guard.ctx, body.id)) {
      return NextResponse.json({ error: 'Showroom không thuộc phạm vi bạn phụ trách.' }, { status: 403 });
    }

    const row: Record<string, unknown> = {};
    if (['least_loaded', 'round_robin', 'weighted', 'day_roster'].includes(body.team_assign_strategy)) {
      row.team_assign_strategy = body.team_assign_strategy;
    }
    if (Number.isFinite(Number(body.assign_share_pct))) {
      row.assign_share_pct = Math.max(0, Number(body.assign_share_pct));
    }
    if (Object.keys(row).length === 0) {
      return NextResponse.json({ error: 'Không có trường hợp lệ để cập nhật.' }, { status: 400 });
    }

    const { error } = await service
      .from('showrooms').update(row).eq('id', body.id).eq('company_id', companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
