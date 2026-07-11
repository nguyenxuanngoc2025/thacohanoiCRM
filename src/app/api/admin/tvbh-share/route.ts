import { NextResponse, type NextRequest } from 'next/server';
import { requireAssignManager, showroomInScope } from '@/lib/assign-guard';
import { resetEffectiveFromForShowroom } from '@/lib/assign-effective';

// Đổi % chỉ tiêu nhận lead của 1 TVBH (users.assign_share_pct) — dùng khi phòng chia theo tỷ lệ.
// Route hẹp riêng cho cấu hình phân giao (admin + gd_showroom), KHÔNG mở update-user rộng cho GĐSR.
export async function POST(request: NextRequest) {
  const guard = await requireAssignManager();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    const userId = String(body.user_id ?? '');
    const pct = Number(body.assign_share_pct);
    if (!userId || !Number.isFinite(pct)) {
      return NextResponse.json({ error: 'Thiếu TVBH hoặc % không hợp lệ.' }, { status: 400 });
    }

    // TVBH phải thuộc CÙNG công ty + có phòng bán hàng.
    const { data: target } = await service
      .from('users').select('id, company_id, sales_team_id').eq('id', userId).maybeSingle();
    if (!target || target.company_id !== companyId) {
      return NextResponse.json({ error: 'Không tìm thấy TVBH trong công ty của bạn.' }, { status: 404 });
    }
    if (!target.sales_team_id) {
      return NextResponse.json({ error: 'TVBH chưa gắn phòng bán hàng.' }, { status: 400 });
    }

    // Suy showroom của TVBH (từ phòng) để kiểm tra phạm vi caller.
    const { data: team } = await service
      .from('sales_teams').select('showroom_id').eq('id', target.sales_team_id).maybeSingle();
    if (!showroomInScope(guard.ctx, team?.showroom_id)) {
      return NextResponse.json({ error: 'TVBH không thuộc showroom bạn phụ trách.' }, { status: 403 });
    }

    const { error } = await service
      .from('users').update({ assign_share_pct: Math.max(0, pct) }).eq('id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Đổi % cấp 3 → đặt lại mốc hiệu lực phân bổ để có tác dụng ngay.
    await resetEffectiveFromForShowroom(service, team?.showroom_id ?? null);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
