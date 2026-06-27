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
    if (keys.some((k) => haystack.includes(k))) matched.push(m.id);
  }

  return matched.length === 1 ? matched[0] : null;
}
