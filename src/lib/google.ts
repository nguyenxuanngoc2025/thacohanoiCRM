// ---- Phần thuần (có unit test) ----

export interface ColumnGuess {
  phoneCol: number | null;
  nameCol: number | null;
}

const PHONE_HINTS = ['so dien thoai', 'dien thoai', 'sdt', 'phone', 'mobile', 'tel', 'lien he'];
const NAME_HINTS = ['ho va ten', 'ho ten', 'fullname', 'full name', 'khach hang', 'name', 'ten'];

function norm(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
}

export function looksLikePhone(v: string): boolean {
  const digits = (v ?? '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 13;
}

export function guessColumns(headerRow: string[], sampleRows: string[][] = []): ColumnGuess {
  const headers = headerRow.map(norm);
  const findByHint = (hints: string[]) =>
    headers.findIndex((h) => h.length > 0 && hints.some((hint) => h.includes(hint)));

  let phoneCol = findByHint(PHONE_HINTS);
  const nameCol = findByHint(NAME_HINTS);

  // Phone fallback: cột có nhiều ô giống SĐT nhất.
  if (phoneCol < 0 && sampleRows.length > 0) {
    const cols = headerRow.length;
    let best = -1, bestScore = 0;
    for (let c = 0; c < cols; c++) {
      const score = sampleRows.filter((r) => looksLikePhone(r[c] ?? '')).length;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (bestScore > 0) phoneCol = best;
  }

  return { phoneCol: phoneCol >= 0 ? phoneCol : null, nameCol: nameCol >= 0 ? nameCol : null };
}

export function buildConsentUrl(params: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', params.clientId);
  u.searchParams.set('redirect_uri', params.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email https://www.googleapis.com/auth/drive.file');
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('state', params.state);
  return u.toString();
}

// ---- Phần gọi mạng (Task 3) ----

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export async function exchangeCodeForTokens(params: {
  code: string; clientId: string; clientSecret: string; redirectUri: string;
}): Promise<{ refreshToken: string; accessToken: string }> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', body });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const json = await res.json() as { refresh_token?: string; access_token?: string };
  if (!json.refresh_token || !json.access_token) throw new Error('thiếu refresh_token/access_token');
  return { refreshToken: json.refresh_token, accessToken: json.access_token };
}

export async function refreshAccessToken(params: {
  refreshToken: string; clientId: string; clientSecret: string;
}): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: params.refreshToken,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', body });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const json = await res.json() as { access_token?: string };
  if (!json.access_token) throw new Error('thiếu access_token');
  return json.access_token;
}

export async function getUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return '';
  const json = await res.json() as { email?: string };
  return json.email ?? '';
}

/** Đọc giá trị 1 vùng của sheet (mảng hàng × cột chuỗi). */
export async function readSheetValues(params: {
  accessToken: string; spreadsheetId: string; range: string;
}): Promise<string[][]> {
  const url = `${SHEETS_API}/${encodeURIComponent(params.spreadsheetId)}/values/${encodeURIComponent(params.range)}?majorDimension=ROWS`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${params.accessToken}` } });
  if (!res.ok) throw new Error(`read sheet failed: ${res.status}`);
  const json = await res.json() as { values?: string[][] };
  return json.values ?? [];
}
