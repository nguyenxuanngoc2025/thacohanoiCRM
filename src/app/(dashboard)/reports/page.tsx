import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CAN_VIEW_REPORTS } from '@/lib/nav';
import type { UserRole } from '@/types/database';
import ReportsView from './ReportsView';
import { loadReportsProps } from './load';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
  if (!me?.role || !CAN_VIEW_REPORTS.has(me.role as UserRole)) redirect('/leads');

  const props = await loadReportsProps(supabase, user, me, sp);

  return <ReportsView {...props} />;
}
