import { createClient } from '@/lib/supabase/server';
import { type LeadRow } from './LeadsTable';
import LeadsView, { type StatCard, type ModelOption } from './LeadsView';
import { isContacted } from '@/lib/lead-status';

export const dynamic = 'force-dynamic';

interface RawLead {
  id: string;
  full_name: string | null;
  phone: string;
  source: string | null;
  status: LeadRow['status'];
  created_at: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  last_note: string | null;
  brand_id: string;
  model_id: string | null;
  assigned_to: string | null;
  brand: { name: string } | null;
  model: { name: string } | null;
  assignee: { full_name: string } | null;
}

export default async function LeadsPage() {
  const supabase = await createClient();

  const [{ data: rawLeads }, { data: rawModels }, { data: contactLogs }] = await Promise.all([
    supabase
      .from('leads')
      .select(
        'id, full_name, phone, source, status, created_at, last_contact_at, next_contact_at, last_note, brand_id, model_id, assigned_to, brand:brands(name), model:models(name), assignee:users!assigned_to(full_name)',
      )
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('models').select('id, name, brand_id').eq('is_active', true).order('sort_order'),
    supabase.from('lead_logs').select('lead_id').eq('type', 'contact'),
  ]);

  // Đếm số lần liên hệ theo lead
  const contactCount: Record<string, number> = {};
  for (const r of (contactLogs ?? []) as { lead_id: string }[]) {
    contactCount[r.lead_id] = (contactCount[r.lead_id] ?? 0) + 1;
  }

  const leads: LeadRow[] = ((rawLeads ?? []) as unknown as RawLead[]).map((l) => ({
    id: l.id,
    full_name: l.full_name,
    phone: l.phone,
    source: l.source,
    status: l.status,
    created_at: l.created_at,
    last_contact_at: l.last_contact_at,
    next_contact_at: l.next_contact_at,
    last_note: l.last_note,
    brand_id: l.brand_id,
    brand_name: l.brand?.name ?? '—',
    model_id: l.model_id,
    model_name: l.model?.name ?? null,
    assignee_name: l.assignee?.full_name ?? null,
    contact_count: contactCount[l.id] ?? 0,
  }));

  const models: ModelOption[] = ((rawModels ?? []) as ModelOption[]);

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

  return <LeadsView cards={cards} leads={leads} models={models} />;
}
