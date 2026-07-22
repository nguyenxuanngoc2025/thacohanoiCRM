import { normalizeForMatch } from '@/lib/detect-model';

export interface ProvinceShowroom {
  id: string;
  province: string | null;
  province_aliases: string[] | null;
}

/**
 * Định tuyến lead theo địa chỉ (cột tự do trong Google Sheet) về tập showroom ĐÚNG TỈNH.
 *
 * Cách khớp: chuẩn hoá địa chỉ (bỏ dấu, viết thường, bỏ ký tự lạ) rồi tìm xem tên tỉnh
 * hoặc "cách ghi khác" (alias) của tỉnh có nằm trong địa chỉ không. Mỗi tỉnh có thể gắn
 * NHIỀU showroom (vd Hà Nội: Đài Tư, Giải Phóng, Chương Mỹ…) → trả HẾT showroom của tỉnh
 * trúng để máy phân giao 3 cấp tự chia trong tỉnh đó.
 *
 * Nhiều tỉnh cùng trúng (địa chỉ lộn xộn) → chọn tỉnh có khoá khớp DÀI NHẤT (cụ thể nhất),
 * tránh alias ngắn thắng oan tỉnh cụ thể.
 *
 * KHÔNG khớp tỉnh nào (địa chỉ trống / lạ) → trả [] để phía gọi tự lùi về thị trường mặc định.
 */
export function matchProvinceShowrooms(
  addressText: string | null | undefined,
  showrooms: ProvinceShowroom[],
): string[] {
  const hay = normalizeForMatch(addressText ?? '');
  if (!hay) return [];

  // Gom theo tỉnh: canonical → { showroomIds, keys }
  const byProvince = new Map<string, { ids: string[]; keys: string[] }>();
  for (const s of showrooms) {
    const prov = (s.province ?? '').trim();
    if (!prov) continue;
    const entry = byProvince.get(prov) ?? { ids: [], keys: [] };
    entry.ids.push(s.id);
    for (const k of [prov, ...(s.province_aliases ?? [])]) {
      const nk = normalizeForMatch(k);
      if (nk && !entry.keys.includes(nk)) entry.keys.push(nk);
    }
    byProvince.set(prov, entry);
  }

  let bestIds: string[] = [];
  let bestLen = 0;
  for (const { ids, keys } of byProvince.values()) {
    // Khoá khớp dài nhất của tỉnh này (cụ thể hơn = ưu tiên hơn khi nhiều tỉnh cùng trúng).
    let hitLen = 0;
    for (const k of keys) if (hay.includes(k) && k.length > hitLen) hitLen = k.length;
    if (hitLen > bestLen) {
      bestLen = hitLen;
      bestIds = ids;
    }
  }
  return bestIds;
}
