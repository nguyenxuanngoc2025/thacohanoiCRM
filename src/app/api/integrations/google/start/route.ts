import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { getPlatformSetting } from '@/lib/platform-settings';
import { buildConsentUrl } from '@/lib/google';
import { randomBytes } from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { companyId } = guard.ctx;
  if (!companyId) return NextResponse.json({ error: 'Tài khoản chưa gắn công ty' }, { status: 400 });

  const clientId = await getPlatformSetting('google_oauth_client_id');
  if (!clientId) return NextResponse.json({ error: 'Nền tảng chưa cấu hình Google Client ID' }, { status: 400 });

  const csrf = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ csrf, company: companyId })).toString('base64url');
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/integrations/google/callback`;
  const url = buildConsentUrl({ clientId, redirectUri, state });

  const res = NextResponse.redirect(url);
  res.cookies.set('g_oauth_csrf', csrf, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' });
  return res;
}
