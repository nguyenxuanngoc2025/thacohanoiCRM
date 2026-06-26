// Tạo tài khoản chủ nền tảng. Chạy 1 lần:
//   node scripts/create-platform-owner.mjs <tên-đăng-nhập|email> <password> "<Họ tên>"
// Tên trơn (vd "0938806341") sẽ tự ghép @thaco.com.vn.
// Yêu cầu biến môi trường: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js';

const EMAIL_DOMAIN = 'thaco.com.vn';
const usernameToEmail = (v) => {
  const s = (v ?? '').trim().toLowerCase();
  return !s ? '' : s.includes('@') ? s : `${s}@${EMAIL_DOMAIN}`;
};

const [rawUser, password, fullName] = process.argv.slice(2);
const email = usernameToEmail(rawUser);
if (!email || !password || !fullName) {
  console.error('Cách dùng: node create-platform-owner.mjs <tên-đăng-nhập> <password> "<Họ tên>"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const svc = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'crm_thacoauto' },
});

const { data: authData, error: authErr } = await svc.auth.admin.createUser({
  email: email.toLowerCase().trim(),
  password,
  email_confirm: true,
  user_metadata: { app: 'crm', full_name: fullName },
});
if (authErr) { console.error('Lỗi tạo auth user:', authErr.message); process.exit(1); }

const authId = authData.user.id;
const { error: profErr } = await svc.from('users').insert({
  id: authId,
  email: email.toLowerCase().trim(),
  full_name: fullName,
  role: 'platform_owner',
  company_id: null,
  is_active: true,
});
if (profErr) {
  await svc.auth.admin.deleteUser(authId);
  console.error('Lỗi tạo profile:', profErr.message);
  process.exit(1);
}

console.log('Đã tạo chủ nền tảng:', email, '(id:', authId + ')');
