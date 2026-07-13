// Client tối giản (cấu trúc) — nhận mọi Supabase client bất kể schema generic, không ràng buộc 'public'.
type CatalogDb = {
  from: (table: string) => {
    select: (cols: string) => {
      order: (col: string) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
    };
  };
};

export interface SourceChannelRow {
  platform_key: string;
  platform_name: string;
  value: string;
  label: string;
  is_builtin: boolean;
  is_active: boolean;
  digital: boolean;
  sort_order: number;
}

export interface SourceCatalog {
  /** Nguồn distinct (còn active) — cho form + filter. Giữ thứ tự sort_order. */
  platforms: { key: string; name: string }[];
  /** Variant active+digital theo platform key — cho form thêm lead. */
  variantsByKey: Record<string, { value: string; label: string }[]>;
  /** value (leads.source) → tên Nguồn. Gồm CẢ dòng inactive để lead cũ hiển thị đúng. */
  valueToPlatform: Record<string, string>;
  /** value → nhãn chi tiết kênh. Gồm CẢ dòng inactive. */
  valueToLabel: Record<string, string>;
}

/** Seed kênh hệ thống — khớp DB migration 0049 + hành vi code cũ. Dùng làm fallback an toàn. */
export const BUILTIN_SEED: SourceChannelRow[] = [
  { platform_key: 'facebook', platform_name: 'Facebook', value: 'facebook', label: 'Lead Ads', is_builtin: true, is_active: true, digital: true, sort_order: 10 },
  { platform_key: 'facebook', platform_name: 'Facebook', value: 'fb_message', label: 'Tin nhắn', is_builtin: true, is_active: true, digital: true, sort_order: 11 },
  { platform_key: 'facebook', platform_name: 'Facebook', value: 'fb_comment', label: 'Bình luận', is_builtin: true, is_active: true, digital: true, sort_order: 12 },
  { platform_key: 'website', platform_name: 'Website form', value: 'Website form', label: 'Mặc định', is_builtin: true, is_active: true, digital: true, sort_order: 20 },
  { platform_key: 'zalo', platform_name: 'Zalo OA', value: 'zalo', label: 'Tin nhắn OA', is_builtin: true, is_active: true, digital: true, sort_order: 30 },
  { platform_key: 'zalo', platform_name: 'Zalo OA', value: 'zalo_ads', label: 'Quảng cáo', is_builtin: true, is_active: true, digital: true, sort_order: 31 },
  { platform_key: 'google_sheet', platform_name: 'Google Sheet', value: 'google_sheet', label: 'Google Sheet', is_builtin: true, is_active: true, digital: true, sort_order: 40 },
  { platform_key: 'google', platform_name: 'Google', value: 'google_hotline', label: 'Hotline', is_builtin: true, is_active: true, digital: true, sort_order: 50 },
  { platform_key: 'google', platform_name: 'Google', value: 'google_form_web', label: 'Form web', is_builtin: false, is_active: true, digital: true, sort_order: 51 },
  { platform_key: 'google', platform_name: 'Google', value: 'google_zalo_oa', label: 'Zalo OA', is_builtin: false, is_active: true, digital: true, sort_order: 52 },
];

/** Dựng catalog từ các dòng DB. platforms/variants = active(+digital); bản đồ hiển thị = tất cả. */
export function buildSourceCatalog(input: SourceChannelRow[]): SourceCatalog {
  const rows = [...input].sort((a, b) => a.sort_order - b.sort_order);

  const platforms: { key: string; name: string }[] = [];
  const seenKey = new Set<string>();
  const variantsByKey: Record<string, { value: string; label: string }[]> = {};
  const valueToPlatform: Record<string, string> = {};
  const valueToLabel: Record<string, string> = {};

  for (const r of rows) {
    valueToPlatform[r.value] = r.platform_name;
    valueToLabel[r.value] = r.label;
    if (r.is_active) {
      if (!seenKey.has(r.platform_key)) {
        seenKey.add(r.platform_key);
        platforms.push({ key: r.platform_key, name: r.platform_name });
      }
      if (r.digital) {
        (variantsByKey[r.platform_key] ??= []).push({ value: r.value, label: r.label });
      }
    }
  }
  return { platforms, variantsByKey, valueToPlatform, valueToLabel };
}

/** Catalog builtin (fallback khi DB rỗng/lỗi hoặc caller chưa truyền catalog). */
export const BUILTIN_CATALOG = buildSourceCatalog(BUILTIN_SEED);

type SourcePatch = Partial<Pick<SourceChannelRow, 'value' | 'label' | 'platform_name' | 'is_active' | 'sort_order'>> & { _delete?: boolean };

/** Quy tắc bảo vệ kênh hệ thống: không đổi value, không xoá. Trả lỗi tiếng Việt. */
export function assertSourceEditable(row: SourceChannelRow, patch: SourcePatch): { ok: true } | { ok: false; error: string } {
  if (!row.is_builtin) return { ok: true };
  if (patch._delete) return { ok: false, error: 'Kênh hệ thống — không thể xoá.' };
  if (patch.value !== undefined && patch.value !== row.value) {
    return { ok: false, error: 'Kênh hệ thống — không được đổi mã (value).' };
  }
  return { ok: true };
}

/** Đọc danh mục từ DB → catalog. Rỗng/lỗi → BUILTIN_CATALOG (an toàn, không chặn nghiệp vụ). */
export async function loadSourceCatalog(db: CatalogDb): Promise<SourceCatalog> {
  try {
    const { data, error } = await db
      .from('lead_source_channels')
      .select('platform_key, platform_name, value, label, is_builtin, is_active, digital, sort_order')
      .order('sort_order');
    if (error || !data || data.length === 0) return BUILTIN_CATALOG;
    return buildSourceCatalog(data as SourceChannelRow[]);
  } catch {
    return BUILTIN_CATALOG;
  }
}
