import { NextResponse, type NextRequest } from 'next/server';
import { requireAssignManager, showroomInScope } from '@/lib/assign-guard';

// Đặt/gỡ lịch phòng trực nhận lead theo ngày dương lịch (chiến lược day_roster).
// op='set': body { showroom_id, roster_date 'YYYY-MM-DD', sales_team_id | null }.
// sales_team_id null = gỡ phòng khỏi ngày đó (xoá dòng lịch).
// Cho admin (toàn công ty) + gd_showroom (chỉ showroom mình phụ trách).
export async function POST(request: NextRequest) {
  const guard = await requireAssignManager();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    if (body.op !== 'set') {
      return NextResponse.json({ error: 'Chỉ hỗ trợ đặt lịch phòng trực.' }, { status: 400 });
    }
    const showroomId = String(body.showroom_id ?? '');
    const rosterDate = String(body.roster_date ?? '');
    const teamId: string | null = body.sales_team_id ? String(body.sales_team_id) : null;
    if (!showroomId || !/^\d{4}-\d{2}-\d{2}$/.test(rosterDate)) {
      return NextResponse.json({ error: 'Thiếu showroom hoặc ngày không hợp lệ.' }, { status: 400 });
    }

    // Cô lập đa công ty: showroom phải thuộc CÙNG công ty với caller.
    const { data: own } = await service
      .from('showrooms').select('id').eq('id', showroomId).eq('company_id', companyId).maybeSingle();
    if (!own) return NextResponse.json({ error: 'Showroom không thuộc công ty của bạn.' }, { status: 404 });
    // Phạm vi: gd_showroom chỉ được đặt lịch showroom mình phụ trách.
    if (!showroomInScope(guard.ctx, showroomId)) {
      return NextResponse.json({ error: 'Showroom không thuộc phạm vi bạn phụ trách.' }, { status: 403 });
    }

    // Nếu có phòng: phòng phải thuộc đúng showroom (chống gán phòng showroom khác).
    if (teamId) {
      const { data: team } = await service
        .from('sales_teams').select('id').eq('id', teamId).eq('showroom_id', showroomId).maybeSingle();
      if (!team) return NextResponse.json({ error: 'Phòng không thuộc showroom này.' }, { status: 400 });
    }

    if (teamId === null) {
      // Gỡ phòng khỏi ngày → xoá dòng lịch (coi như chưa đặt).
      const { error } = await service
        .from('showroom_day_roster').delete()
        .eq('showroom_id', showroomId).eq('roster_date', rosterDate);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    } else {
      const { error } = await service
        .from('showroom_day_roster')
        .upsert(
          { company_id: companyId, showroom_id: showroomId, roster_date: rosterDate, sales_team_id: teamId, updated_at: new Date().toISOString() },
          { onConflict: 'showroom_id,roster_date' },
        );
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
