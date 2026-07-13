/** Chuẩn hoá để so khớp: bỏ dấu, hạ thường, bỏ mọi ký tự không phải [a-z0-9]. */
export function normalizeForMatch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export interface DetectModelInput {
  brandId: string;
  text: string;
  models: { id: string; brand_id: string; name: string; keywords: string[]; is_active: boolean }[];
}

const isDigit = (c: string) => c >= '0' && c <= '9';

/**
 * Khoá `key` có xuất hiện trong `haystack` không, KHÔNG dính chuỗi con của số dài hơn.
 * Vd "cx3" KHÔNG được coi là trúng trong "cx30" (ký tự liền sau là số) — nếu không,
 * mọi tin nhắc "CX-30" sẽ khớp cả CX-3 lẫn CX-30 → nhập nhằng → bỏ trống dòng xe.
 * Chặn khi ranh giới số: đầu/cuối khoá là số mà ký tự sát bên ngoài cũng là số.
 */
function keyHit(haystack: string, key: string): boolean {
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(key, from);
    if (i < 0) return false;
    const before = i > 0 ? haystack[i - 1] : '';
    const after = i + key.length < haystack.length ? haystack[i + key.length] : '';
    const beforeOk = !(isDigit(key[0]) && isDigit(before));
    const afterOk = !(isDigit(key[key.length - 1]) && isDigit(after));
    if (beforeOk && afterOk) return true;
    from = i + 1;
  }
}

/** Trả model_id nếu text trúng đúng 1 dòng active của brand; ngược lại null. */
export function detectModel(input: DetectModelInput): string | null {
  const haystack = normalizeForMatch(input.text);
  if (!haystack) return null;

  const matched: string[] = [];
  for (const m of input.models) {
    if (!m.is_active || m.brand_id !== input.brandId) continue;
    const keys = [m.name, ...m.keywords]
      .map(normalizeForMatch)
      .filter((k) => k.length > 0);
    if (keys.some((k) => keyHit(haystack, k))) matched.push(m.id);
  }

  return matched.length === 1 ? matched[0] : null;
}
