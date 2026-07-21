import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { getPlatformSetting } from '@/lib/platform-settings';
import { refreshAccessToken } from '@/lib/google';
import { decrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

// Đúc access token ngắn hạn (scope drive.file đã cấp lúc "Kết nối Google") để cửa sổ Picker
// dùng trực tiếp — KHÔNG bắt người dùng đăng nhập Google lại mỗi lần chọn file.
export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  const { data: conn } = await service.from('google_connections')
    .select('refresh_token_enc').eq('company_id', companyId).maybeSingle();
  if (!conn) return NextResponse.json({ error: 'Công ty chưa kết nối Google' }, { status: 400 });

  const clientId = await getPlatformSetting('google_oauth_client_id');
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.json({ error: 'Chưa cấu hình Google' }, { status: 400 });

  try {
    const token = await refreshAccessToken({
      refreshToken: decrypt(conn.refresh_token_enc as string), clientId, clientSecret,
    });
    return NextResponse.json({ token });
  } catch {
    return NextResponse.json({ error: 'Không lấy được quyền Google. Hãy kết nối lại Google.' }, { status: 400 });
  }
}
