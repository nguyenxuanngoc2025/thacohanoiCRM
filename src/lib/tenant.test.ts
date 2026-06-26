// src/lib/tenant.test.ts
import { describe, it, expect } from 'vitest';
import { parseHost } from './tenant';

const D = 'crmthacoauto.com';

describe('parseHost', () => {
  it('subdomain nền tảng → kind subdomain', () => {
    expect(parseHost('danang.crmthacoauto.com', D)).toEqual({ kind: 'subdomain', sub: 'danang' });
  });
  it('bỏ port + hạ chữ thường', () => {
    expect(parseHost('Hanoi.CrmThacoAuto.com:443', D)).toEqual({ kind: 'subdomain', sub: 'hanoi' });
  });
  it('vanity domain → kind custom', () => {
    expect(parseHost('crm.thacoautohn-mkt.com', D)).toEqual({ kind: 'custom', host: 'crm.thacoautohn-mkt.com' });
  });
  it('tên miền gốc nền tảng → kind root', () => {
    expect(parseHost('crmthacoauto.com', D)).toEqual({ kind: 'root' });
  });
  it('subdomain nhiều cấp → root (từ chối)', () => {
    expect(parseHost('a.b.crmthacoauto.com', D)).toEqual({ kind: 'root' });
  });
  it('localhost → custom (resolver sẽ rơi về mặc định)', () => {
    expect(parseHost('localhost', D)).toEqual({ kind: 'custom', host: 'localhost' });
  });
});
