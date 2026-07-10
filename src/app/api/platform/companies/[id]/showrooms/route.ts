import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';
import { writeAudit } from '@/lib/platform-audit';

// PATCH /api/platform/companies/:id/showrooms — bật/tắt 1 showroom của công ty.
// Chỉ platform_owner. Kiểm tra showroom thuộc ĐÚNG công ty (chống đổi showroom công ty khác).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service, userId } = guard.ctx;
  const { id: companyId } = await params;

  try {
    const body = await request.json() as { showroom_id?: string; is_active?: boolean };
    const showroomId = (body.showroom_id ?? '').trim();
    if (!showroomId || typeof body.is_active !== 'boolean') {
      return NextResponse.json({ error: 'Thiếu showroom_id hoặc is_active.' }, { status: 400 });
    }

    // Cô lập: showroom phải thuộc đúng công ty trong URL.
    const { data: sr } = await service
      .from('showrooms').select('id, company_id, name').eq('id', showroomId).maybeSingle();
    if (!sr || String((sr as { company_id: string }).company_id) !== companyId) {
      return NextResponse.json({ error: 'Showroom không thuộc công ty này.' }, { status: 404 });
    }

    const { error } = await service
      .from('showrooms').update({ is_active: body.is_active }).eq('id', showroomId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await writeAudit(service, userId, body.is_active ? 'showroom.activate' : 'showroom.deactivate',
      'showroom', showroomId, { company_id: companyId, name: (sr as { name: string }).name });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
