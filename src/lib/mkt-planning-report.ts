import { effectiveStatus, type ReportLead } from './reports';

export type PlanningChannel = 'Facebook' | 'Google' | 'Khác';
export const PLANNING_CHANNELS: readonly PlanningChannel[] = ['Facebook', 'Google', 'Khác'];

/**
 * Nền tảng nguồn (đã resolve qua sourcePlatform) → kênh của bảng Kế hoạch.
 * So khớp KHÔNG phân biệt hoa/thường: sourcePlatform trả tên Nguồn ('Facebook'/'Google'),
 * còn key thô ('facebook'/'google') vẫn khớp đúng.
 */
export function channelFromPlatform(platform: string | null): PlanningChannel {
  const p = (platform ?? '').trim().toLowerCase();
  if (p === 'facebook') return 'Facebook';
  if (p === 'google') return 'Google';
  return 'Khác';
}

export interface ModelCatalogItem {
  id: string;
  brand_id: string;
  brand_name: string;
  name: string;
  sort_order: number;
}

export interface MetricCell { khqt: number; gdtd: number; khd: number; }
export interface ModelRow {
  model_id: string;
  model_name: string;
  cells: Record<PlanningChannel, MetricCell>;
}
export interface BrandReport {
  brand_id: string;
  brand_name: string;
  rows: ModelRow[];
  total: Record<PlanningChannel, MetricCell>;
  /** Lead có trạng thái KHQT/GDTD/KHĐ nhưng không khớp dòng xe nào (không tính vào bảng). */
  unmapped: number;
}

function emptyCells(): Record<PlanningChannel, MetricCell> {
  return {
    Facebook: { khqt: 0, gdtd: 0, khd: 0 },
    Google: { khqt: 0, gdtd: 0, khd: 0 },
    'Khác': { khqt: 0, gdtd: 0, khd: 0 },
  };
}

/**
 * Gom lead (đã lọc showroom + tháng ở ngoài) thành báo cáo brand → model × channel.
 * `platformOf` resolve nền tảng của 1 lead (caller dùng sourcePlatform + catalog).
 * Chỉ đếm trạng thái KHQT/GDTD/KHĐ (theo effectiveStatus). Model rows lấy từ danh mục
 * `models` (giữ cả dòng 0 lead), sắp theo sort_order rồi tên.
 */
export function buildMktPlanningReport(
  leads: ReportLead[],
  models: ModelCatalogItem[],
  platformOf: (l: ReportLead) => string | null,
): BrandReport[] {
  const byBrand = new Map<string, BrandReport>();
  const brandOrder: string[] = [];
  const modelIndex = new Map<string, { brandId: string; rowIdx: number }>();

  const sorted = [...models].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  for (const m of sorted) {
    let br = byBrand.get(m.brand_id);
    if (!br) {
      br = { brand_id: m.brand_id, brand_name: m.brand_name, rows: [], total: emptyCells(), unmapped: 0 };
      byBrand.set(m.brand_id, br);
      brandOrder.push(m.brand_id);
    }
    modelIndex.set(m.id, { brandId: m.brand_id, rowIdx: br.rows.length });
    br.rows.push({ model_id: m.id, model_name: m.name, cells: emptyCells() });
  }

  for (const l of leads) {
    const br = byBrand.get(l.brand_id);
    if (!br) continue; // hãng ngoài danh mục hiển thị
    const es = effectiveStatus(l);
    if (es !== 'KHQT' && es !== 'GDTD' && es !== 'KHĐ') continue;
    const metric: keyof MetricCell = es === 'KHQT' ? 'khqt' : es === 'GDTD' ? 'gdtd' : 'khd';
    const ch = channelFromPlatform(platformOf(l));
    const idx = l.model_id ? modelIndex.get(l.model_id) : undefined;
    if (idx && idx.brandId === l.brand_id) {
      br.rows[idx.rowIdx].cells[ch][metric] += 1;
      br.total[ch][metric] += 1;
    } else {
      br.unmapped += 1;
    }
  }

  return brandOrder
    .map((id) => byBrand.get(id)!)
    .sort((a, b) => a.brand_name.localeCompare(b.brand_name));
}

/** Khối TSV 1 kênh: mỗi dòng xe 1 dòng `KHQT\tGDTD\tKHĐ`, ngăn dòng bằng \n. */
export function toChannelTsv(brand: BrandReport, channel: PlanningChannel): string {
  return brand.rows
    .map((r) => { const c = r.cells[channel]; return `${c.khqt}\t${c.gdtd}\t${c.khd}`; })
    .join('\n');
}
