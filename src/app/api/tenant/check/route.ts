import { NextRequest, NextResponse } from 'next/server';
import { isProvisionedHost } from '@/lib/tenant';

// Caddy on-demand TLS gọi: GET /api/tenant/check?domain=<hostname>
export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get('domain') ?? '';
  const ok = await isProvisionedHost(domain);
  return ok
    ? new NextResponse('ok', { status: 200 })
    : new NextResponse('not provisioned', { status: 404 });
}
