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

/** Origin trung tâm của nền tảng (apex) — địa chỉ Google cố định cho MỌI công ty.
 * Mọi luồng OAuth Google (redirect_uri + cửa sổ Picker) đi qua đây để Google Console
 * chỉ phải khai 1 lần; thêm công ty mới (subdomain / tên miền riêng) không cần đụng Google. */
export function platformOrigin(): string {
  return `https://${PLATFORM_DOMAIN}`;
}

/** Origin công khai (https://host-that-tao) từ header request.
 * Sau reverse proxy (Caddy/Hostinger), `request.url` là địa chỉ bind nội bộ
 * (vd http://localhost:3007). Host + scheme thật do proxy chuyển qua
 * `x-forwarded-host` / `x-forwarded-proto`. Dùng cho OAuth redirect URI. */
export function publicOriginFromHeaders(h: Headers): string {
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  return `${proto}://${host}`;
}

/** Đọc Host của request hiện tại (server component / route) → tenant.
 * Ưu tiên `x-forwarded-host`: khi Next render trang đích trong luồng Server Action
 * redirect, `host` là địa chỉ bind nội bộ (vd localhost:3007), còn host thật do
 * reverse proxy (Caddy/Hostinger) chuyển qua `x-forwarded-host`. */
export async function getTenant(): Promise<TenantCompany | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  return resolveCompanyFromHost(host);
}

/**
 * Dùng cho on-demand TLS `ask`: hostname này có được phép cấp cert không?
 * KHÁC resolveCompanyFromHost — KHÔNG fallback công ty mặc định; host lạ → false.
 */
export async function isProvisionedHost(
  rawHost: string,
  platformDomain: string = PLATFORM_DOMAIN,
): Promise<boolean> {
  const host = rawHost.toLowerCase().split(':')[0].trim();
  if (!host) return false;
  if (host === platformDomain) return true; // apex nền tảng

  const svc = createServiceClient();
  const match = parseHost(host, platformDomain);
  if (match.kind === 'subdomain') {
    const { data } = await svc.from('companies').select('id').eq('subdomain', match.sub).maybeSingle();
    return !!data;
  }
  if (match.kind === 'custom') {
    const { data } = await svc.from('companies').select('id').eq('custom_domain', match.host).maybeSingle();
    return !!data;
  }
  return false; // root khác apex (không xảy ra) → từ chối
}
