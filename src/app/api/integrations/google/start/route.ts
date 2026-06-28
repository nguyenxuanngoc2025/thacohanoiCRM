import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { getPlatformSetting } from '@/lib/platform-settings';
import { buildConsentUrl } from '@/lib/google';
import { publicOriginFromHeaders, platformOrigin } from '@/lib/tenant';
import { signState } from '@/lib/oauth-state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { companyId } = guard.ctx;
  if (!companyId) return NextResponse.json({ error: 'Tài khoản chưa gắn công ty' }, { status: 400 });

  const clientId = await getPlatformSetting('google_oauth_client_id');
  if (!clientId) return NextResponse.json({ error: 'Nền tảng chưa cấu hình Google Client ID' }, { status: 400 });

  // Redirect URI LUÔN là apex trung tâm (khai Google 1 lần). State ký HMAC mang
  // company + origin tenant để callback (chạy ở apex, không có session/cookie tenant)
  // biết lưu token cho công ty nào và đưa người dùng quay lại đâu.
  const redirectUri = `${platformOrigin()}/api/integrations/google/callback`;
  const returnOrigin = publicOriginFromHeaders(request.headers);
  const state = signState({ c: companyId, r: returnOrigin });
  const url = buildConsentUrl({ clientId, redirectUri, state });

  return NextResponse.redirect(url);
}
