// Helper thuần cho enforcement quota nền tảng — không phụ thuộc Supabase, dễ test.

/** Đã chạm trần quota showroom chưa? max = 0 nghĩa là chưa cấu hình → chặn. */
export function isShowroomQuotaReached(current: number, max: number): boolean {
  return current >= max;
}

/** Các brand_id được yêu cầu nhưng KHÔNG nằm trong whitelist công ty được cấp. */
export function disallowedBrandIds(requested: string[], allowed: string[]): string[] {
  const allow = new Set(allowed);
  return requested.filter((id) => !allow.has(id));
}
