import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentRole } from '@/lib/platform-guard';
import { totalPaid, outstanding, isContractOverdue, summarize } from '@/lib/revenue';
import RevenueManager from '@/components/platform/RevenueManager';
import type { ContractRow, CompanyOption } from '@/components/platform/types';

export const dynamic = 'force-dynamic';

export default async function RevenuePage() {
  const role = await getCurrentRole();
  if (role !== 'platform_owner') redirect('/leads');

  const service = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: contracts }, { data: payments }, { data: schedule }, { data: companies }] =
    await Promise.all([
      service.from('platform_contracts')
        .select('id,company_id,prospect_name,plan_label,contract_value,currency,signed_at,term_months,expiry_date,status,notes')
        .order('created_at', { ascending: false }),
      service.from('platform_payments').select('contract_id,paid_at,amount'),
      service.from('platform_payment_schedule').select('contract_id,due_date,amount'),
      service.from('companies').select('id,name').order('name'),
    ]);

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

  const rows: ContractRow[] = ((contracts ?? []) as Omit<ContractRow, 'company_name' | 'paid' | 'outstanding' | 'overdue'>[]).map((c) => {
    const pays = payByContract[c.id] ?? [];
    const value = Number(c.contract_value);
    return {
      ...c,
      contract_value: value,
      company_name: c.company_id ? (companyName[c.company_id] ?? null) : null,
      paid: totalPaid(pays),
      outstanding: outstanding(value, pays),
      overdue: isContractOverdue(schByContract[c.id] ?? [], pays, today),
    };
  });

  const totals = summarize(rows.map((r) => ({ contract_value: r.contract_value, paid: r.paid })));
  const companyOptions = (companies ?? []) as CompanyOption[];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Doanh thu</h1>
        <p className="text-sm text-slate-400 mt-0.5">Hợp đồng bán CRM · thực nhận · công nợ</p>
      </div>
      <RevenueManager contracts={rows} totals={totals} companies={companyOptions} />
    </div>
  );
}
