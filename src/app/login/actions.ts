'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/tenant';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !auth.user) redirect('/login?error=1');

  // Cô lập đa công ty: tài khoản phải thuộc ĐÚNG công ty của tên miền đang truy cập.
  // Chặn ngay tại bước đăng nhập để không tạo phiên cho công ty khác.
  const tenant = await getTenant();
  const { data: profile } = await supabase
    .from('users').select('company_id, role').eq('id', auth.user.id).maybeSingle();
  if (tenant && profile?.company_id && profile.company_id !== tenant.id) {
    await supabase.auth.signOut();
    redirect('/login?error=wrongtenant');
  }
  // Chủ nền tảng vào bảng điều khiển nền tảng; quản trị công ty vào Cài đặt;
  // các vai trò khác vào danh sách Lead.
  const landing = profile?.role === 'platform_owner'
    ? '/admin'
    : profile?.role === 'admin'
      ? '/settings'
      : '/leads';
  redirect(landing);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
