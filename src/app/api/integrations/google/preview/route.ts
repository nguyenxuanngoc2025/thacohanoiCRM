import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { getPlatformSetting } from '@/lib/platform-settings';
import { refreshAccessToken, readSheetValues, guessColumns } from '@/lib/google';
import { decrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { service, companyId } = guard.ctx;

  const url = new URL(request.url);
  const spreadsheetId = url.searchParams.get('spreadsheetId');
  const tab = url.searchParams.get('tab') || '';
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
    const range = tab ? `${tab}!A1:Z6` : 'A1:Z6';
    const rows = await readSheetValues({ accessToken, spreadsheetId, range });
    const headers = rows[0] ?? [];
    const sample = rows.slice(1);
    return NextResponse.json({ headers, sample, guess: guessColumns(headers, sample) });
  } catch {
    return NextResponse.json({ error: 'Không đọc được sheet. Kiểm tra quyền chia sẻ hoặc kết nối lại Google.' }, { status: 400 });
  }
}
