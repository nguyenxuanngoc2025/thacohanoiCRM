import { NextResponse, type NextRequest } from 'next/server';
import { getPlatformSetting } from '@/lib/platform-settings';
import { exchangeCodeForTokens, getUserEmail } from '@/lib/google';
import { platformOrigin } from '@/lib/tenant';
import { verifyState } from '@/lib/oauth-state';
import { createServiceClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

// Callback CHẠY Ở APEX trung tâm cho MỌI công ty → không có session/cookie của tenant.
// Tin cậy state đã ký HMAC (không giả mạo được) để biết company + nơi quay lại.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = verifyState(url.searchParams.get('state'));

  // Nơi đưa người dùng quay lại: origin tenant trong state; nếu state hỏng → apex.
  const back = (status: 'connected' | 'error') => {
    const dest = new URL('/settings', state?.r ?? platformOrigin());
    dest.searchParams.set('google', status);
    return NextResponse.redirect(dest);
  };

  if (!code || !state) return back('error');

  const clientId = await getPlatformSetting('google_oauth_client_id');
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return back('error');

  try {
    const redirectUri = `${platformOrigin()}/api/integrations/google/callback`;
    const { refreshToken, accessToken } = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri });
    const email = await getUserEmail(accessToken);
    const service = createServiceClient();
    await service.from('google_connections').upsert({
      company_id: state.c,
      google_email: email || null,
      refresh_token_enc: encrypt(refreshToken),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' });
    return back('connected');
  } catch { return back('error'); }
}
