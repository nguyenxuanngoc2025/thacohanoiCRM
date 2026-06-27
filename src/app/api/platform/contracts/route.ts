import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformOwner } from '@/lib/platform-guard';
import { writeAudit } from '@/lib/platform-audit';
import { totalPaid, outstanding, isContractOverdue, summarize } from '@/lib/revenue';

type ContractRow = {
  id: string; company_id: string | null; prospect_name: string | null; plan_label: string | null;
  contract_value: number; currency: string; signed_at: string | null; term_months: number | null;
  expiry_date: string | null; status: string; notes: string | null;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/** expiry = signed_at + term_months (cuối ngày). Trả null nếu thiếu dữ kiện. */
function computeExpiry(signedAt: string | null, termMonths: number | null): string | null {
  if (!signedAt || !termMonths || termMonths <= 0) return null;
  const d = new Date(signedAt + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + termMonths);
  return d.toISOString().slice(0, 10);
}

// GET /api/platform/contracts — danh sách hợp đồng + đã thu / công nợ / quá hạn + dòng tổng
export async function GET() {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service } = guard.ctx;

  const [{ data: contracts }, { data: payments }, { data: schedule }, { data: companies }] =
    await Promise.all([
      service.from('platform_contracts')
        .select('id,company_id,prospect_name,plan_label,contract_value,currency,signed_at,term_months,expiry_date,status,notes')
        .order('created_at', { ascending: false }),
      service.from('platform_payments').select('contract_id,paid_at,amount'),
      service.from('platform_payment_schedule').select('contract_id,due_date,amount'),
      service.from('companies').select('id,name'),
    ]);

  const today = todayISO();
  const companyName: Record<string, string> = {};
  for (const c of (companies ?? []) as { id: string; name: string }[]) companyName[c.id] = c.name;

  const payByContract: Record<string, { paid_at: string; amount: number }[]> = {};
  for (const p of (payments ?? []) as { contract_id: string; paid_at: string; amount: number }[]) {
    (payByContract[p.contract_id] ??= []).push({ paid_at: p.paid_at, amount: Number(p.amount) });
  }
  const schByContract: Record<string, { due_date: string; amount: number }[]> = {};
  for (const s of (schedule ?? []) as { contract_id: string; due_date: string; amount: number }[]) {
    (schByContract[s.contract_id] ??= []).push({ due_date: s.due_date, amount: Number(s.amount) });
  }

  const rows = ((contracts ?? []) as ContractRow[]).map((c) => {
    const pays = payByContract[c.id] ?? [];
    const value = Number(c.contract_value);
    const paid = totalPaid(pays);
    return {
      ...c,
      contract_value: value,
      company_name: c.company_id ? (companyName[c.company_id] ?? null) : null,
      paid,
      outstanding: outstanding(value, pays),
      overdue: isContractOverdue(schByContract[c.id] ?? [], pays, today),
    };
  });

  const totals = summarize(rows.map((r) => ({ contract_value: r.contract_value, paid: r.paid })));
  return NextResponse.json({ contracts: rows, totals });
}

// POST /api/platform/contracts — tạo hợp đồng mới (giá trị + thời hạn tự do)
export async function POST(request: NextRequest) {
  const guard = await requirePlatformOwner();
  if (guard.error) return guard.error;
  const { service, userId } = guard.ctx;

  try {
    const body = await request.json() as {
      company_id?: string | null; prospect_name?: string; plan_label?: string;
      contract_value?: number; signed_at?: string | null; term_months?: number | null;
      status?: string; notes?: string;
    };
    const value = Math.max(0, Number(body.contract_value ?? 0));
    const companyId = body.company_id || null;
    const prospect = (body.prospect_name ?? '').trim() || null;
    if (!companyId && !prospect) {
      return NextResponse.json({ error: 'Chọn công ty hoặc nhập tên khách tiềm năng.' }, { status: 400 });
    }
    const signedAt = body.signed_at || null;
    const termMonths = body.term_months ? Math.max(0, Math.floor(body.term_months)) : null;
    const status = ['prospect', 'active', 'expired', 'churned'].includes(body.status ?? '')
      ? body.status! : (companyId ? 'active' : 'prospect');

    const { data, error } = await service.from('platform_contracts').insert({
      company_id: companyId,
      prospect_name: prospect,
      plan_label: (body.plan_label ?? '').trim() || null,
      contract_value: value,
      signed_at: signedAt,
      term_months: termMonths,
      expiry_date: computeExpiry(signedAt, termMonths),
      status,
      notes: (body.notes ?? '').trim() || null,
    }).select('id').single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Không tạo được hợp đồng.' }, { status: 400 });

    await writeAudit(service, userId, 'contract.create', 'contract', data.id, {
      company_id: companyId, prospect, contract_value: value, term_months: termMonths,
    });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
