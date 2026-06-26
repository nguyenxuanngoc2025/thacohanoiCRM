// src/lib/tenant.ts
export type HostMatch =
  | { kind: 'custom'; host: string }
  | { kind: 'subdomain'; sub: string }
  | { kind: 'root' };

/** Tách Host header → cách tra công ty. platformDomain vd 'crmthacoauto.com'. */
export function parseHost(rawHost: string, platformDomain: string): HostMatch {
  const host = rawHost.toLowerCase().split(':')[0].trim();
  if (host === platformDomain) return { kind: 'root' };
  const suffix = '.' + platformDomain;
  if (host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length);
    if (sub && !sub.includes('.')) return { kind: 'subdomain', sub };
    return { kind: 'root' }; // nhiều cấp hoặc rỗng → không hợp lệ
  }
  return { kind: 'custom', host };
}
