/**
 * Phân nhánh "chi tiết kênh" theo platform key (single source of truth).
 * Kênh có nhiều nhánh → form thêm lead hiện thêm dropdown chọn nhánh; giá trị `value`
 * chính là `source` lưu DB. Kênh KHÔNG có nhánh (website, zalo…) bỏ qua dropdown này.
 * Facebook tách 3 nhánh: Lead Ads / Tin nhắn / Bình luận (khớp webhook + backfill).
 */
export interface SourceVariant {
  value: string;
  label: string;
}

export const SOURCE_VARIANTS: Record<string, SourceVariant[]> = {
  facebook: [
    { value: 'facebook', label: 'Lead Ads' },
    { value: 'fb_message', label: 'Tin nhắn' },
    { value: 'fb_comment', label: 'Bình luận' },
  ],
};

/** Nhãn chi tiết kênh cho cột Nguồn — derive từ SOURCE_VARIANTS để khỏi trùng lặp. */
const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(SOURCE_VARIANTS).flat().map((v) => [v.value, v.label]),
);

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return '—';
  const known = SOURCE_LABELS[source];
  if (known) return known;
  return source.charAt(0).toUpperCase() + source.slice(1);
}
