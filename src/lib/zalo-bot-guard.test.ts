import { describe, it, expect } from 'vitest';
import { resolveZaloBotCompany } from './zalo-bot-guard';

describe('resolveZaloBotCompany', () => {
  it('admin → ép companyId của chính họ (bỏ qua requested)', () => {
    expect(resolveZaloBotCompany({ role: 'admin', callerCompanyId: 'C1', requestedCompanyId: 'C2' }))
      .toEqual({ companyId: 'C1' });
  });
  it('admin không gắn công ty → lỗi', () => {
    expect(resolveZaloBotCompany({ role: 'admin', callerCompanyId: null, requestedCompanyId: null }))
      .toEqual({ error: 'Tài khoản chưa gắn công ty' });
  });
  it('platform_owner → dùng requestedCompanyId', () => {
    expect(resolveZaloBotCompany({ role: 'platform_owner', callerCompanyId: null, requestedCompanyId: 'C9' }))
      .toEqual({ companyId: 'C9' });
  });
  it('platform_owner thiếu requestedCompanyId → lỗi', () => {
    expect(resolveZaloBotCompany({ role: 'platform_owner', callerCompanyId: null, requestedCompanyId: null }))
      .toEqual({ error: 'Thiếu công ty' });
  });
  it('vai trò khác → lỗi quyền', () => {
    expect(resolveZaloBotCompany({ role: 'sales', callerCompanyId: 'C1', requestedCompanyId: null }))
      .toEqual({ error: 'forbidden' });
  });
});
