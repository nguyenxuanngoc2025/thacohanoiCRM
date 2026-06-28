type Args = {
  role: string | null;
  callerCompanyId: string | null;
  requestedCompanyId: string | null;
};

/**
 * Chọn companyId cho route zalo-bot:
 * - admin: LUÔN dùng công ty của chính họ (không cho chỉ định công ty khác).
 * - platform_owner: dùng companyId truyền vào (bắt buộc).
 * - vai trò khác: từ chối.
 */
export function resolveZaloBotCompany(a: Args): { companyId: string } | { error: string } {
  if (a.role === 'admin') {
    if (!a.callerCompanyId) return { error: 'Tài khoản chưa gắn công ty' };
    return { companyId: a.callerCompanyId };
  }
  if (a.role === 'platform_owner') {
    if (!a.requestedCompanyId) return { error: 'Thiếu công ty' };
    return { companyId: a.requestedCompanyId };
  }
  return { error: 'forbidden' };
}
