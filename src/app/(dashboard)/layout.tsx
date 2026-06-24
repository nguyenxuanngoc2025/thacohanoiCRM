import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardShell from '@/components/layout/DashboardShell';
import { type UserRole } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, role, company_id')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile?.role ?? 'tvbh') as UserRole;
  const userName = profile?.full_name ?? user.email ?? 'Người dùng';

  let companyName = 'Thaco Auto Hà Nội';
  if (profile?.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', profile.company_id)
      .maybeSingle();
    if (company?.name) companyName = company.name;
  }

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
      userCode={role === 'admin' ? 'Quản trị hệ thống' : role === 'manager' ? 'Quản lý' : 'Tư vấn bán hàng'}
      companyName={companyName}
      metrics={metrics}
    >
      {children}
    </DashboardShell>
  );
}
