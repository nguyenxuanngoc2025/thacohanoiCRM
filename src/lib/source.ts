/**
 * Nguồn & chi tiết kênh lead — nay đọc từ danh mục DB (lib/source-catalog.ts).
 * `sourcePlatform/sourceLabel` nhận catalog TÙY CHỌN: truyền → tra được cả kênh tự thêm;
 * không truyền → dùng catalog builtin (khớp hành vi code cũ, không hồi quy).
 */
import { BUILTIN_CATALOG, type SourceCatalog } from './source-catalog';

export type { SourceCatalog };
export interface SourceVariant { value: string; label: string }

/** Phân nhánh chi tiết kênh builtin theo platform key — fallback cho form khi chưa có catalog DB. */
export const SOURCE_VARIANTS: Record<string, SourceVariant[]> = BUILTIN_CATALOG.variantsByKey;

/** Nguồn data (nền tảng): Facebook / Website / Zalo… Truyền `catalog` để tra kênh tự thêm; không truyền → builtin. */
export function sourcePlatform(source: string | null | undefined, catalog?: SourceCatalog): string {
  if (!source) return '—';
  const map = (catalog ?? BUILTIN_CATALOG).valueToPlatform;
  const known = map[source];
  if (known) return known;
  // Nguồn lưu sẵn tên kênh lạ → viết hoa chữ đầu
  return source.charAt(0).toUpperCase() + source.slice(1);
}

/** Chi tiết kênh: Lead Ads / Tin nhắn / Bình luận… Truyền `catalog` để tra kênh tự thêm. */
export function sourceLabel(source: string | null | undefined, catalog?: SourceCatalog): string {
  if (!source) return '—';
  return (catalog ?? BUILTIN_CATALOG).valueToLabel[source] ?? '—';
}
