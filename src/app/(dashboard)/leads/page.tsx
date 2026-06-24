import { createClient } from '@/lib/supabase/server';
import { type LeadRow } from './LeadsTable';
import LeadsView, { type StatCard } from './LeadsView';
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

  const cards: StatCard[] = [
    { label: 'Tổng lead', value: total, color: '#004B9B', bg: '#e6f0fa' },
    { label: 'Chưa liên hệ', value: pending, color: '#b45309', bg: '#fffbeb' },
    { label: 'Đã liên hệ', value: contacted, color: '#047857', bg: '#ecfdf5' },
    { label: 'Tỷ lệ liên hệ', value: `${contactRate}%`, color: '#0468BF', bg: '#e6f0fa' },
    { label: 'GDTD', value: gdtd, color: '#7c3aed', bg: '#f5f3ff' },
  ];

  return <LeadsView cards={cards} leads={leads} />;
}
