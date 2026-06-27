import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';
import { writeAudit } from '@/lib/platform-audit';

// POST /api/platform/contracts/:id/payments — ghi nhận 1 lần thực nhận
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service, userId } = guard.ctx;
  const { id } = await params;

  try {
    const body = await request.json() as { paid_at?: string; amount?: number; method?: string; note?: string };
    const amount = Number(body.amount ?? 0);
    const paidAt = body.paid_at || '';
    if (!paidAt || !(amount > 0)) {
      return NextResponse.json({ error: 'Nhập ngày thu và số tiền (> 0).' }, { status: 400 });
    }
    const { error } = await service.from('platform_payments').insert({
      contract_id: id, paid_at: paidAt, amount, method: (body.method ?? '').trim() || null, note: (body.note ?? '').trim() || null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await writeAudit(service, userId, 'payment.create', 'contract', id, { paid_at: paidAt, amount });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
