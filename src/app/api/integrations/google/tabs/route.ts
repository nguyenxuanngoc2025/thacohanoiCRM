import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { getPlatformSetting } from '@/lib/platform-settings';
import { refreshAccessToken, listSheetTabs } from '@/lib/google';
import { decrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

// Liệt kê các tab (sheet con) của 1 file Google Sheet — để người dùng tick chọn tab cần lấy lead.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  const url = new URL(request.url);
  const spreadsheetId = url.searchParams.get('spreadsheetId');
  if (!spreadsheetId) return NextResponse.json({ error: 'Thiếu spreadsheetId' }, { status: 400 });

  const { data: conn } = await service.from('google_connections')
    .select('refresh_token_enc').eq('company_id', companyId).maybeSingle();
  if (!conn) return NextResponse.json({ error: 'Công ty chưa kết nối Google' }, { status: 400 });

  const clientId = await getPlatformSetting('google_oauth_client_id');
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.json({ error: 'Chưa cấu hình Google' }, { status: 400 });

  try {
    const accessToken = await refreshAccessToken({
      refreshToken: decrypt(conn.refresh_token_enc as string), clientId, clientSecret,
    });
    const tabs = await listSheetTabs({ accessToken, spreadsheetId });
    return NextResponse.json({ tabs });
  } catch (err) {
    console.error('[google/tabs] liệt kê tab thất bại', err);
    return NextResponse.json({ error: 'Không đọc được danh sách tab. Kiểm tra quyền chia sẻ hoặc kết nối lại Google.' }, { status: 400 });
  }
}
