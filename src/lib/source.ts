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

interface ChannelDef {
  key: string;       // platform key
  platform: string;  // tên Nguồn data hiển thị (Facebook, Website…)
  variants: SourceVariant[];
}

const CHANNELS: ChannelDef[] = [
  {
    key: 'facebook',
    platform: 'Facebook',
    variants: [
      { value: 'facebook', label: 'Lead Ads' },
      { value: 'fb_message', label: 'Tin nhắn' },
      { value: 'fb_comment', label: 'Bình luận' },
    ],
  },
];

/** Phân nhánh chi tiết kênh theo platform key — cho form thêm lead. */
export const SOURCE_VARIANTS: Record<string, SourceVariant[]> = Object.fromEntries(
  CHANNELS.map((c) => [c.key, c.variants]),
);

// value (source DB) → tên Nguồn data / nhãn chi tiết kênh
const VALUE_TO_PLATFORM: Record<string, string> = Object.fromEntries(
  CHANNELS.flatMap((c) => c.variants.map((v) => [v.value, c.platform])),
);
const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  CHANNELS.flatMap((c) => c.variants.map((v) => [v.value, v.label])),
);

/** Nguồn data (nền tảng): Facebook / Website / Zalo… — cột "Nguồn". */
export function sourcePlatform(source: string | null | undefined): string {
  if (!source) return '—';
  const known = VALUE_TO_PLATFORM[source];
  if (known) return known;
  // Nguồn lưu sẵn tên kênh (vd "Website form", "Zalo OA") → viết hoa chữ đầu
  return source.charAt(0).toUpperCase() + source.slice(1);
}

/** Chi tiết kênh: Lead Ads / Tin nhắn / Bình luận… — cột "Chi tiết kênh". */
export function sourceLabel(source: string | null | undefined): string {
  if (!source) return '—';
  return SOURCE_LABELS[source] ?? '—';
}
