import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// State OAuth ký HMAC để đi XUYÊN DOMAIN (start chạy ở tenant, callback ở apex →
// cookie/session không chia sẻ được). Chữ ký chống giả mạo company/returnOrigin.

export interface OAuthState {
  c: string; // company_id
  r: string; // return origin (https://tenant-host) — nơi đưa người dùng quay lại
  exp: number; // epoch giây hết hạn
}

function secret(): string {
  const s = process.env.TOKEN_ENC_KEY;
  if (!s) throw new Error('TOKEN_ENC_KEY missing');
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function hmac(payloadB64: string): string {
  return b64url(createHmac('sha256', secret()).update(payloadB64).digest());
}

/** Ký state: base64url(JSON) + '.' + base64url(hmac). ttlSec mặc định 10 phút. */
export function signState(data: Omit<OAuthState, 'exp'>, ttlSec = 600): string {
  const state: OAuthState = { ...data, exp: Math.floor(Date.now() / 1000) + ttlSec };
  const payload = b64url(Buffer.from(JSON.stringify({ ...state, n: randomBytes(8).toString('hex') })));
  return `${payload}.${hmac(payload)}`;
}

/** Trả OAuthState nếu chữ ký đúng + chưa hết hạn, ngược lại null. */
export function verifyState(token: string | null | undefined): OAuthState | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
    if (!obj.c || !obj.r || typeof obj.exp !== 'number') return null;
    if (obj.exp < Math.floor(Date.now() / 1000)) return null;
    return { c: obj.c, r: obj.r, exp: obj.exp };
  } catch {
    return null;
  }
}
