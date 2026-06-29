// app/src/app/(dashboard)/doi-soat/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/tenant';
import { B10_IMPORT } from '@/lib/nav';
import { type UserRole } from '@/types/database';
import B10ImportView from './B10ImportView';

export const dynamic = 'force-dynamic';

export default async function DoiSoatPage() {
  const tenant = await getTenant();
  if (!tenant?.b10_enabled) redirect('/leads');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!me?.role || !B10_IMPORT.includes(me.role as UserRole)) redirect('/leads');

  const { data: company } = await supabase
    .from('companies').select('b10_mapping').eq('id', tenant.id).maybeSingle();
  const savedMapping = (company?.b10_mapping ?? null) as { phone_col: string; status_col: string } | null;

  return <B10ImportView savedMapping={savedMapping} />;
}
