import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';
import { writeAudit } from '@/lib/platform-audit';

// POST /api/platform/contracts/:id/schedule — thêm 1 đợt thu dự kiến
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service, userId } = guard.ctx;
  const { id } = await params;

  try {
    const body = await request.json() as { due_date?: string; amount?: number; note?: string };
    const amount = Number(body.amount ?? 0);
    const dueDate = body.due_date || '';
    if (!dueDate || !(amount > 0)) {
      return NextResponse.json({ error: 'Nhập ngày dự kiến và số tiền (> 0).' }, { status: 400 });
    }
    const { error } = await service.from('platform_payment_schedule').insert({
      contract_id: id, due_date: dueDate, amount, note: (body.note ?? '').trim() || null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await writeAudit(service, userId, 'schedule.create', 'contract', id, { due_date: dueDate, amount });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
