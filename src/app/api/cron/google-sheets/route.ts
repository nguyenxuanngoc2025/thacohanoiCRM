import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { getPlatformSetting } from '@/lib/platform-settings';
import { refreshAccessToken } from '@/lib/google';
import { decrypt } from '@/lib/crypto';
import { syncSheetChannel, type SheetConfig } from '@/lib/google-sheet-sync';

export const dynamic = 'force-dynamic';

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
    const res = await syncSheetChannel(
      service,
      { id: ch.id as string, page_id: ch.page_id as string, config: (ch.config ?? null) as SheetConfig | null },
      getToken,
    );
    ingested += res.fresh;
    deduped += res.dup;
    for (const e of res.errors) errors.push({ sheet: ch.page_id as string, error: e });
  }

  return NextResponse.json({ ok: true, ingested, deduped, errors });
}
