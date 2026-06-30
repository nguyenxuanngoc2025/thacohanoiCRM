import { timingSafeEqual } from 'crypto';

export function checkCronSecret(header: string | null, expected: string | undefined): boolean {
  if (!header || !expected) return false;
  // timingSafeEqual chống timing attack: thời gian so sánh cố định bất kể ký tự đúng/sai.
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
