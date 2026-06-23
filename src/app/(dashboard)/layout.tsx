import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { logout } from '../login/actions';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  const roleLabel: Record<string, string> = { admin: 'Quản trị', manager: 'Quản lý', tvbh: 'TVBH' };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="relative bg-white border-b border-slate-200">
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #004B9B 0%, #0468BF 100%)' }} />
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #004B9B, #0468BF)' }}>
              <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <div className="font-bold text-slate-900 leading-tight">CRM THACO Auto</div>
              <div className="text-[11px] text-slate-400 leading-tight">Quản lý khách hàng đa kênh</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-700 leading-tight">{profile?.full_name ?? user.email}</div>
              <div className="text-[11px] text-slate-400 leading-tight">{profile?.role ? roleLabel[profile.role] ?? profile.role : ''}</div>
            </div>
            <form action={logout}>
              <button type="submit" className="text-sm font-medium text-slate-500 hover:text-[#004B9B] border border-slate-200 rounded-lg px-3 py-1.5 transition-colors">
                Đăng xuất
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
