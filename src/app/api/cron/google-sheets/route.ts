import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { getPlatformSetting } from '@/lib/platform-settings';
import { refreshAccessToken, readSheetValues } from '@/lib/google';
import { decrypt } from '@/lib/crypto';
import { ingestLead } from '@/lib/ingest';

export const dynamic = 'force-dynamic';

interface SheetConfig {
  connection_id?: string; tabs?: string[]; tab?: string | null;
  phone_col?: number; name_col?: number | null; note_cols?: number[];
}

export async function POST(request: NextRequest) {
  if (!checkCronSecret(request.headers.get('x-cron-secret'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const clientId = await getPlatformSetting('google_oauth_client_id');
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.json({ error: 'Chưa cấu hình Google' }, { status: 400 });

  const { data: channels } = await service.from('channel_accounts')
    .select('id, page_id, config').eq('platform', 'google_sheet').eq('is_active', true);

  let ingested = 0, deduped = 0;
  const errors: { sheet: string; error: string }[] = [];

  // Cache access token theo connection (mỗi công ty 1 token) để đỡ refresh nhiều lần.
  const tokenCache = new Map<string, string>();
  const getToken = async (connectionId: string): Promise<string> => {
    const cached = tokenCache.get(connectionId);
    if (cached) return cached;
    const { data: conn } = await service.from('google_connections')
      .select('refresh_token_enc').eq('id', connectionId).maybeSingle();
    if (!conn) throw new Error('connection-missing');
    const token = await refreshAccessToken({
      refreshToken: decrypt(conn.refresh_token_enc as string), clientId, clientSecret,
    });
    tokenCache.set(connectionId, token);
    return token;
  };

  for (const ch of channels ?? []) {
    const cfg = (ch.config ?? {}) as SheetConfig;
    if (!cfg.connection_id || cfg.phone_col == null) { errors.push({ sheet: ch.page_id, error: 'config-missing' }); continue; }
    // Danh sách tab cần quét: ưu tiên mảng `tabs`, fallback `tab` đơn (tương thích cũ),
    // cuối cùng quét tab mặc định (null) nếu chưa cấu hình tab nào.
    const tabList: (string | null)[] = (cfg.tabs && cfg.tabs.length > 0)
      ? cfg.tabs
      : (cfg.tab ? [cfg.tab] : [null]);
    try {
      const accessToken = await getToken(cfg.connection_id);
      for (const tab of tabList) {
        const range = tab ? `${tab}!A1:Z5000` : 'A1:Z5000';
        const rows = await readSheetValues({ accessToken, spreadsheetId: ch.page_id, range });
        for (const r of rows.slice(1)) { // bỏ header
          const phone = r[cfg.phone_col] ?? '';
          if (!phone.replace(/\D/g, '')) continue;
          const name = cfg.name_col != null ? (r[cfg.name_col] ?? null) : null;
          const notes = (cfg.note_cols ?? []).map((c) => r[c]).filter(Boolean).join(' · ');
          const res = await ingestLead({
            page_id: ch.page_id,
            phone_raw: phone,
            full_name: name,
            source: 'google_sheet',
            intent_text: [name, notes].filter(Boolean).join(' '),
            // Lưu tên tab để truy nguồn lead (tab nào = chiến dịch/kênh nào).
            external_payload: { row: r, tab },
          });
          if (res.ok) { if (res.deduped) deduped++; else ingested++; }
        }
      }
    } catch (e) {
      errors.push({ sheet: ch.page_id, error: e instanceof Error ? e.message : 'unknown' });
    }
  }

  return NextResponse.json({ ok: true, ingested, deduped, errors });
}
