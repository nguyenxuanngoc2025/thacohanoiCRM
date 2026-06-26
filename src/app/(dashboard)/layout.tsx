import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardShell from '@/components/layout/DashboardShell';
import { type UserRole } from '@/types/database';
import { ROLE_LABELS } from '@/lib/nav';
import { getTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();
  if (!tenant) redirect('/login?tenant=unknown');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  // Chặn nhầm tenant: user phải thuộc đúng công ty của tên miền đang truy cập.
  // (Vai trò "Chủ nền tảng" cross-company sẽ nới ở plan #3.)
  if (profile?.company_id && profile.company_id !== tenant.id) {
    await supabase.auth.signOut();
    redirect('/login?error=wrongtenant');
  }

  const role = (profile?.role ?? 'tvbh') as UserRole;
  const userName = profile?.full_name ?? user.email ?? 'Người dùng';
  const companyName = tenant.branding?.display_name ?? tenant.name;

  const { data: leadRows } = await supabase.from('leads').select('status').limit(5000);
  const tally = (s: string) => (leadRows ?? []).filter((l) => l.status === s).length;
  const metrics = [
    { label: 'Tổng lead', value: leadRows?.length ?? 0 },
    { label: 'KHQT', value: tally('KHQT') },
    { label: 'GDTD', value: tally('GDTD') },
    { label: 'KHĐ', value: tally('KHĐ') },
  ];

  return (
    <DashboardShell
      userName={userName}
      userRole={role}
      userCode={ROLE_LABELS[role] ?? 'Tư vấn bán hàng'}
      companyName={companyName}
      metrics={metrics}
    >
      {children}
    </DashboardShell>
  );
}
