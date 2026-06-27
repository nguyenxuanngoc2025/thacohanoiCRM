import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';
import { writeAudit } from '@/lib/platform-audit';
import { totalPaid, outstanding, isContractOverdue } from '@/lib/revenue';

const todayISO = () => new Date().toISOString().slice(0, 10);

function computeExpiry(signedAt: string | null, termMonths: number | null): string | null {
  if (!signedAt || !termMonths || termMonths <= 0) return null;
  const d = new Date(signedAt + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + termMonths);
  return d.toISOString().slice(0, 10);
}

// GET /api/platform/contracts/:id — chi tiết HĐ + lịch thu + thực nhận + tổng
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service } = guard.ctx;
  const { id } = await params;

  const [{ data: contract }, { data: payments }, { data: schedule }] = await Promise.all([
    service.from('platform_contracts')
      .select('id,company_id,prospect_name,plan_label,contract_value,currency,signed_at,term_months,expiry_date,status,notes')
      .eq('id', id).maybeSingle(),
    service.from('platform_payments').select('id,paid_at,amount,method,note').eq('contract_id', id).order('paid_at', { ascending: false }),
    service.from('platform_payment_schedule').select('id,due_date,amount,note').eq('contract_id', id).order('due_date'),
  ]);
  if (!contract) return NextResponse.json({ error: 'Không tìm thấy hợp đồng.' }, { status: 404 });

  const pays = ((payments ?? []) as { paid_at: string; amount: number }[]).map((p) => ({ paid_at: p.paid_at, amount: Number(p.amount) }));
  const sch = ((schedule ?? []) as { due_date: string; amount: number }[]).map((s) => ({ due_date: s.due_date, amount: Number(s.amount) }));
  const value = Number((contract as { contract_value: number }).contract_value);

  return NextResponse.json({
    contract,
    payments: payments ?? [],
    schedule: schedule ?? [],
    paid: totalPaid(pays),
    outstanding: outstanding(value, pays),
    overdue: isContractOverdue(sch, pays, todayISO()),
  });
}

// PATCH /api/platform/contracts/:id — sửa thông tin HĐ
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service, userId } = guard.ctx;
  const { id } = await params;

  try {
    const body = await request.json() as {
      plan_label?: string; contract_value?: number; signed_at?: string | null;
      term_months?: number | null; status?: string; notes?: string;
    };
    const patch: Record<string, unknown> = {};
    if (typeof body.plan_label === 'string') patch.plan_label = body.plan_label.trim() || null;
    if (typeof body.contract_value === 'number') patch.contract_value = Math.max(0, body.contract_value);
    if (typeof body.notes === 'string') patch.notes = body.notes.trim() || null;
    if (body.status && ['prospect', 'active', 'expired', 'churned'].includes(body.status)) patch.status = body.status;

    // signed_at / term_months đổi → tính lại expiry. Cần đọc giá trị hiện tại nếu chỉ đổi 1 trong 2.
    const touchSigned = body.signed_at !== undefined;
    const touchTerm = body.term_months !== undefined;
    if (touchSigned || touchTerm) {
      const { data: cur } = await service.from('platform_contracts').select('signed_at,term_months').eq('id', id).maybeSingle();
      const signedAt = touchSigned ? (body.signed_at || null) : ((cur as { signed_at: string | null } | null)?.signed_at ?? null);
      const termMonths = touchTerm ? (body.term_months ? Math.max(0, Math.floor(body.term_months)) : null)
        : ((cur as { term_months: number | null } | null)?.term_months ?? null);
      patch.signed_at = signedAt;
      patch.term_months = termMonths;
      patch.expiry_date = computeExpiry(signedAt, termMonths);
    }
    patch.updated_at = new Date().toISOString();

    const { error } = await service.from('platform_contracts').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await writeAudit(service, userId, 'contract.update', 'contract', id, patch);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
