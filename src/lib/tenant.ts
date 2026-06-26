import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

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

export interface CompanyBranding {
  display_name?: string;
  logo_url?: string;
  primary_color?: string;
}

export interface TenantCompany {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  custom_domain: string | null;
  branding: CompanyBranding;
  plan_status: string;
}

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'crmthacoauto.com';
const DEFAULT_SLUG = process.env.DEFAULT_COMPANY_SLUG ?? 'thaco-auto-hanoi';
const SELECT = 'id,name,slug,subdomain,custom_domain,branding,plan_status';

/**
 * Tra công ty theo Host:
 * - custom domain khớp → công ty đó
 * - subdomain nền tảng khớp → công ty đó; KHÔNG khớp → null (tenant chưa cấp)
 * - root / domain lạ (localhost dev) → công ty mặc định
 */
export async function resolveCompanyFromHost(rawHost: string): Promise<TenantCompany | null> {
  const svc = createServiceClient();
  const match = parseHost(rawHost, PLATFORM_DOMAIN);

  if (match.kind === 'custom') {
    const { data } = await svc.from('companies').select(SELECT).eq('custom_domain', match.host).maybeSingle();
    if (data) return data as unknown as TenantCompany;
    // domain lạ (vd localhost khi dev) → rơi xuống mặc định
  } else if (match.kind === 'subdomain') {
    const { data } = await svc.from('companies').select(SELECT).eq('subdomain', match.sub).maybeSingle();
    return (data as unknown as TenantCompany) ?? null; // subdomain chưa cấp → null
  }

  const { data } = await svc.from('companies').select(SELECT).eq('slug', DEFAULT_SLUG).maybeSingle();
  return (data as unknown as TenantCompany) ?? null;
}

/** Đọc Host của request hiện tại (server component / route) → tenant. */
export async function getTenant(): Promise<TenantCompany | null> {
  const h = await headers();
  return resolveCompanyFromHost(h.get('host') ?? '');
}
