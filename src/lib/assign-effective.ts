import type { createServiceClient } from '@/lib/supabase/server';

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Đặt lại mốc hiệu lực phân bổ (assign_effective_from = now()) cho MỌI kênh đổ lead vào showroom này.
 * Gọi khi admin đổi tỷ lệ / kiểu chia CẤP 2 (phòng) hoặc CẤP 3 (TVBH). Lý do: ingest dùng chung 1 mốc
 * cho cả 3 cấp, nhưng trước đây chỉ route kênh (cấp 1) mới đặt lại mốc → đổi tỷ lệ phòng/TVBH không có
 * hiệu lực ngay vì lead cũ vẫn bị đếm. Đặt lại ở đây để "hiệu lực kể từ lúc đổi" áp dụng cho cả 3 cấp;
 * lead cũ giữ nguyên, chỉ thôi kéo lệch cân bằng từ thời điểm này.
 */
export async function resetEffectiveFromForShowroom(
  service: ServiceClient,
  showroomId: string | null | undefined,
): Promise<void> {
  if (!showroomId) return;
  const ids = new Set<string>();
  // Kênh phục vụ showroom qua junction nhiều-nhiều.
  const { data: junction } = await service
    .from('channel_account_showrooms')
    .select('channel_account_id')
    .eq('showroom_id', showroomId);
  for (const j of (junction ?? []) as { channel_account_id: string }[]) ids.add(j.channel_account_id);
  // Kênh có anchor là showroom này (trường hợp chưa dùng junction).
  const { data: anchored } = await service
    .from('channel_accounts')
    .select('id')
    .eq('showroom_id', showroomId);
  for (const c of (anchored ?? []) as { id: string }[]) ids.add(c.id);
  if (ids.size === 0) return;
  await service
    .from('channel_accounts')
    .update({ assign_effective_from: new Date().toISOString() })
    .in('id', [...ids]);
}
