// Suy thương hiệu + tập showroom ứng viên cho 1 lần nạp lead.
// Ưu tiên GHI ĐÈ (Google Sheet cấu hình riêng từng tab); nếu không thì suy từ kênh + junction.
export interface IngestScopeInput {
  channelBrandId: string | null;
  channelShowroomId: string | null;
  junctionShowroomIds: string[];
  overrideBrandId?: string | null;
  overrideShowroomIds?: string[] | null;
  hasBrandOverride?: boolean; // true = tôn trọng overrideBrandId kể cả khi = null
}

export interface IngestScope { brandId: string | null; candidateShowroomIds: string[] }

export function resolveIngestScope(i: IngestScopeInput): IngestScope {
  const brandId = (i.hasBrandOverride || i.overrideBrandId)
    ? (i.overrideBrandId ?? null)
    : i.channelBrandId;

  const override = i.overrideShowroomIds && i.overrideShowroomIds.length > 0 ? i.overrideShowroomIds : null;
  const fromChannel = i.junctionShowroomIds.length > 0
    ? i.junctionShowroomIds
    : i.channelShowroomId ? [i.channelShowroomId] : [];
  return { brandId, candidateShowroomIds: override ?? fromChannel };
}
