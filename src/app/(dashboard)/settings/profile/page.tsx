import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ROLE_LABELS } from '@/lib/nav';
import { type UserRole } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, email, role')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile?.role ?? 'tvbh') as UserRole;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Hồ sơ cá nhân</h1>
        <p className="text-sm text-slate-400 mt-0.5">Thông tin tài khoản của bạn</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <Field label="Họ tên" value={profile?.full_name ?? '—'} />
        <Field label="Email" value={profile?.email ?? user.email ?? '—'} />
        <Field label="Vai trò" value={ROLE_LABELS[role] ?? role} />
      </div>

      <div id="password" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-sm font-bold text-slate-900">Đổi mật khẩu</h2>
        <p className="text-sm text-slate-400 mt-2">Liên hệ quản trị hệ thống để đổi mật khẩu.</p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
}
