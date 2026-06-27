import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentRole } from '@/lib/platform-guard';
import { totalPaid, summarize } from '@/lib/revenue';

export const dynamic = 'force-dynamic';

const fmt = (n: number) => n.toLocaleString('vi-VN');
const startOfMonthISO = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
};
const inDaysISO = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export default async function OverviewPage() {
  const role = await getCurrentRole();
  if (role !== 'platform_owner') redirect('/leads');

  const service = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = startOfMonthISO();
  const soon = inDaysISO(30);

  const [{ data: companies }, { data: showrooms }, { data: contracts }, { data: payments }, { data: schedule }] =
    await Promise.all([
      service.from('companies').select('id,name,plan_status,max_showrooms,created_at'),
      service.from('showrooms').select('company_id'),
      service.from('platform_contracts').select('id,company_id,prospect_name,contract_value,status,expiry_date'),
      service.from('platform_payments').select('contract_id,amount'),
      service.from('platform_payment_schedule').select('contract_id,due_date,amount'),
    ]);

  const companyList = (companies ?? []) as { id: string; name: string; plan_status: string; max_showrooms: number; created_at: string }[];
  const srCount: Record<string, number> = {};
  for (const s of (showrooms ?? []) as { company_id: string | null }[]) {
    if (s.company_id) srCount[s.company_id] = (srCount[s.company_id] ?? 0) + 1;
  }

  const totalCompanies = companyList.length;
  const newThisMonth = companyList.filter((c) => (c.created_at ?? '') >= monthStart).length;
  const activeCount = companyList.filter((c) => c.plan_status === 'active').length;
  const suspendedCount = companyList.filter((c) => c.plan_status === 'suspended').length;

  const payByContract: Record<string, { amount: number }[]> = {};
  for (const p of (payments ?? []) as { contract_id: string; amount: number }[]) {
    (payByContract[p.contract_id] ??= []).push({ amount: Number(p.amount) });
  }
  const contractList = (contracts ?? []) as { id: string; company_id: string | null; prospect_name: string | null; contract_value: number; status: string; expiry_date: string | null }[];
  const totalCollected = contractList.reduce((s, c) => s + totalPaid(payByContract[c.id] ?? []), 0);
  const { totalOutstanding } = summarize(contractList.map((c) => ({
    contract_value: Number(c.contract_value), paid: totalPaid(payByContract[c.id] ?? []),
  })));
  const expiringSoon = contractList.filter((c) => c.status === 'active' && c.expiry_date && c.expiry_date >= today && c.expiry_date <= soon);

  // Công ty sắp chạm trần (>= 80% quota)
  const nearQuota = companyList
    .map((c) => ({ ...c, used: srCount[c.id] ?? 0, ratio: c.max_showrooms > 0 ? (srCount[c.id] ?? 0) / c.max_showrooms : 0 }))
    .filter((c) => c.ratio >= 0.8)
    .sort((a, b) => b.ratio - a.ratio);

  // Khoản thu sắp tới / quá hạn (theo lịch dự kiến)
  const companyByContract: Record<string, string> = {};
  for (const c of contractList) companyByContract[c.id] = c.company_id
    ? (companyList.find((x) => x.id === c.company_id)?.name ?? '—')
    : (c.prospect_name ?? '—');
  const upcoming = ((schedule ?? []) as { contract_id: string; due_date: string; amount: number }[])
    .filter((s) => s.due_date <= soon)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 8);

  const kpis = [
    { label: 'Tổng công ty', value: fmt(totalCompanies), sub: `+${newThisMonth} trong tháng` },
    { label: 'Đang hoạt động', value: fmt(activeCount), sub: `${suspendedCount} tạm khóa` },
    { label: 'Tổng đã thu', value: fmt(totalCollected), sub: 'VND' },
    { label: 'Tổng công nợ', value: fmt(totalOutstanding), sub: 'VND' },
    { label: 'HĐ sắp hết hạn', value: fmt(expiringSoon.length), sub: 'trong 30 ngày' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Tổng quan</h1>
        <p className="text-sm text-slate-400 mt-0.5">KPI kinh doanh nền tảng</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-400">{k.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{k.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Công ty sắp chạm trần quota</h2>
          {nearQuota.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có công ty nào ≥ 80% quota.</p>
          ) : (
            <ul className="space-y-2">
              {nearQuota.map((c) => {
                const color = c.ratio >= 1 ? '#e11d48' : '#d97706';
                return (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{c.name}</span>
                    <span className="font-medium" style={{ color }}>{c.used}/{c.max_showrooms} showroom</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Khoản thu sắp tới / quá hạn</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có lịch thu nào trong 30 ngày.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((s, i) => {
                const overdue = s.due_date < today;
                return (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">
                      {companyByContract[s.contract_id] ?? '—'}
                      <span className="text-slate-400"> · {s.due_date}</span>
                      {overdue && <span className="ml-2 text-rose-600 font-medium">quá hạn</span>}
                    </span>
                    <span className="font-medium text-slate-900">{fmt(Number(s.amount))} đ</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
