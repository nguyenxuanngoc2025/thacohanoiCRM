import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Xác thực chữ ký webhook Zalo OA.
 *
 * Zalo ký mỗi sự kiện ở header `X-ZEvent-Signature` dạng `mac=<sha256hex>`, với
 *   mac = SHA256(appId + rawBody + timeStamp + OASecretKey)
 * trong đó rawBody là chuỗi JSON gốc của request, timeStamp là field `timestamp`
 * trong body, OASecretKey là khoá bí mật của OA (lưu ở channel_accounts.secret).
 *
 * Trả false nếu thiếu tham số hoặc chữ ký không khớp.
 */
export function verifyZaloSignature(params: {
  signatureHeader: string | null | undefined;
  appId: string | null | undefined;
  rawBody: string;
  timestamp: string | number | null | undefined;
  secret: string | null | undefined;
}): boolean {
  const { signatureHeader, appId, rawBody, timestamp, secret } = params;
  if (!signatureHeader || !appId || !secret || timestamp == null) return false;

  const provided = signatureHeader.startsWith('mac=')
    ? signatureHeader.slice(4)
    : signatureHeader;
  if (!provided) return false;

  const expected = createHash('sha256')
    .update(`${appId}${rawBody}${timestamp}${secret}`)
    .digest('hex');

  // So sánh chống timing attack — độ dài phải bằng nhau trước.
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
