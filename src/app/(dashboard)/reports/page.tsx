import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CAN_VIEW_REPORTS } from '@/lib/nav';
import type { UserRole } from '@/types/database';
import type { ReportLead } from '@/lib/reports';
import ReportsView, { type RangeKey } from './ReportsView';

export const dynamic = 'force-dynamic';

interface RawLead {
  status: ReportLead['status'];
  source: string | null;
  brand_id: string;
  showroom_id: string | null;
  assigned_to: string | null;
  created_at: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  fail_reason: string | null;
  brand: { name: string } | null;
  showroom: { name: string } | null;
  assignee: { full_name: string } | null;
}

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Quy đổi bộ chọn thời gian → [fromMs, toMs]. Mặc định: tháng này. */
function resolveRange(range: RangeKey, from?: string, to?: string): { fromMs: number; toMs: number } {
  const now = Date.now();
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (range === 'last_month') {
    return { fromMs: Date.UTC(y, m - 1, 1), toMs: Date.UTC(y, m, 1) - 1 };
  }
  if (range === '30d') {
    return { fromMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 29 * DAY, toMs: now };
  }
  if (range === 'custom' && from && to) {
    const f = Date.parse(`${from}T00:00:00Z`);
    const t = Date.parse(`${to}T23:59:59Z`);
    if (!Number.isNaN(f) && !Number.isNaN(t) && f <= t) return { fromMs: f, toMs: t };
  }
  // this_month (mặc định)
  return { fromMs: Date.UTC(y, m, 1), toMs: now };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!me?.role || !CAN_VIEW_REPORTS.has(me.role as UserRole)) redirect('/leads');

  const range = (['this_month', 'last_month', '30d', 'custom'].includes(sp.range ?? '')
    ? sp.range
    : 'this_month') as RangeKey;
  const { fromMs, toMs } = resolveRange(range, sp.from, sp.to);

  const { data: raw } = await supabase
    .from('leads')
    .select(
      'status, source, brand_id, showroom_id, assigned_to, created_at, last_contact_at, next_contact_at, fail_reason, brand:brands(name), showroom:showrooms(name), assignee:users!assigned_to(full_name)',
    )
    .gte('created_at', iso(fromMs))
    .lte('created_at', iso(toMs))
    .order('created_at', { ascending: false })
    .limit(5000);

  const leads: ReportLead[] = ((raw ?? []) as unknown as RawLead[]).map((l) => ({
    status: l.status,
    source: l.source,
    brand_id: l.brand_id,
    brand_name: l.brand?.name ?? '—',
    showroom_id: l.showroom_id,
    showroom_name: l.showroom?.name ?? null,
    assigned_to: l.assigned_to,
    assignee_name: l.assignee?.full_name ?? null,
    created_at: l.created_at,
    last_contact_at: l.last_contact_at,
    next_contact_at: l.next_contact_at,
    fail_reason: l.fail_reason,
  }));

  return (
    <ReportsView
      leads={leads}
      range={range}
      from={sp.from ?? ymd(fromMs)}
      to={sp.to ?? ymd(toMs)}
      fromMs={fromMs}
      toMs={toMs}
    />
  );
}
