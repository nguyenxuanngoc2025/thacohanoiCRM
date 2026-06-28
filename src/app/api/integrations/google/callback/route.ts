import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/admin-guard';
import { getPlatformSetting } from '@/lib/platform-settings';
import { exchangeCodeForTokens, getUserEmail } from '@/lib/google';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const settingsUrl = new URL('/settings', url.origin);
  const fail = () => { settingsUrl.searchParams.set('google', 'error'); return NextResponse.redirect(settingsUrl); };

  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  if (!code || !stateRaw) return fail();

  let state: { csrf: string; company: string };
  try { state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8')); } catch { return fail(); }

  const csrfCookie = (await cookies()).get('g_oauth_csrf')?.value;
  if (!csrfCookie || csrfCookie !== state.csrf) return fail();

  // User phải là admin của đúng công ty trong state.
  const guard = await requireAdmin();
  if (guard.error || guard.ctx.companyId !== state.company) return fail();
  const { service } = guard.ctx;

  const clientId = await getPlatformSetting('google_oauth_client_id');
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail();

  try {
    const redirectUri = `${url.origin}/api/integrations/google/callback`;
    const { refreshToken, accessToken } = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri });
    const email = await getUserEmail(accessToken);
    await service.from('google_connections').upsert({
      company_id: state.company,
      google_email: email || null,
      refresh_token_enc: encrypt(refreshToken),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' });
    settingsUrl.searchParams.set('google', 'connected');
    return NextResponse.redirect(settingsUrl);
  } catch { return fail(); }
}
