import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';

// Cập nhật sla_config (thời hạn phản hồi theo vòng 1-3). Upsert theo (company_id, round).
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  try {
    const body = await request.json();
    const round = Number(body.round);
    if (![1, 2, 3].includes(round)) {
      return NextResponse.json({ error: 'Vòng không hợp lệ (1-3)' }, { status: 400 });
    }
    const row = {
      company_id: companyId,
      round,
      first_response_hours: Math.max(0, Number(body.first_response_hours ?? 2)),
      follow_up_hours: Math.max(0, Number(body.follow_up_hours ?? 24)),
      is_active: body.is_active ?? true,
    };

    const { error } = await service
      .from('sla_config')
      .upsert(row, { onConflict: 'company_id,round' });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
