// Quy ước tài khoản: người dùng chỉ nhập tên trơn (vd "nguyenvana"),
// hệ thống tự ghép đuôi email cố định để lưu/đăng nhập trên Supabase.
// Nếu đã nhập sẵn full email (có "@") thì giữ nguyên.
export const EMAIL_DOMAIN = 'thaco.com.vn';

export function usernameToEmail(input: string): string {
  const v = (input ?? '').trim().toLowerCase();
  if (!v) return '';
  return v.includes('@') ? v : `${v}@${EMAIL_DOMAIN}`;
}
