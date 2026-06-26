import { describe, it, expect, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from }),
}));

import { isProvisionedHost } from './tenant';

describe('isProvisionedHost', () => {
  beforeEach(() => { maybeSingle.mockReset(); eq.mockClear(); });

  it('apex nền tảng → true (không query DB)', async () => {
    expect(await isProvisionedHost('crmthacoauto.com', 'crmthacoauto.com')).toBe(true);
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it('subdomain đã cấp → true', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: 'x' } });
    expect(await isProvisionedHost('danang.crmthacoauto.com', 'crmthacoauto.com')).toBe(true);
    expect(eq).toHaveBeenCalledWith('subdomain', 'danang');
  });

  it('subdomain CHƯA cấp → false', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null });
    expect(await isProvisionedHost('rac.crmthacoauto.com', 'crmthacoauto.com')).toBe(false);
  });

  it('custom domain đã cấp (HN) → true', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: 'hn' } });
    expect(await isProvisionedHost('crm.thacoautohn-mkt.com', 'crmthacoauto.com')).toBe(true);
    expect(eq).toHaveBeenCalledWith('custom_domain', 'crm.thacoautohn-mkt.com');
  });

  it('custom domain lạ → false (chống cấp cert domain rác)', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null });
    expect(await isProvisionedHost('evil.example.com', 'crmthacoauto.com')).toBe(false);
  });
});
