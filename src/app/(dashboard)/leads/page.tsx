import { createClient } from '@/lib/supabase/server';
import LeadsTable, { type LeadRow } from './LeadsTable';
import { isContacted } from '@/lib/lead-status';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('leads')
    .select('id, full_name, phone, source, status, created_at, last_contact_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const leads = (data ?? []) as LeadRow[];
  const total = leads.length;
  const pending = leads.filter((l) => !isContacted(l.last_contact_at)).length;
  const contacted = total - pending;
  const contactRate = total ? Math.round((contacted / total) * 100) : 0;
  const gdtd = leads.filter((l) => l.status === 'GDTD').length;

  const CARDS: { label: string; value: string | number; color: string; bg: string }[] = [
    { label: 'Tổng lead', value: total, color: '#004B9B', bg: '#e6f0fa' },
    { label: 'Chưa liên hệ', value: pending, color: '#b45309', bg: '#fffbeb' },
    { label: 'Đã liên hệ', value: contacted, color: '#047857', bg: '#ecfdf5' },
    { label: 'Tỷ lệ liên hệ', value: `${contactRate}%`, color: '#0468BF', bg: '#e6f0fa' },
    { label: 'GDTD', value: gdtd, color: '#7c3aed', bg: '#f5f3ff' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Lead khách hàng</h1>
        <p className="text-sm text-slate-400 mt-0.5">Theo dõi lead đã liên hệ chưa và phân loại</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {CARDS.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: c.color }}>{c.label}</div>
            <div className="text-3xl font-bold text-slate-900 mt-2">{c.value}</div>
            <div className="mt-3 h-1 rounded-full" style={{ background: c.bg }} />
          </div>
        ))}
      </div>

      <LeadsTable leads={leads} />
    </div>
  );
}
