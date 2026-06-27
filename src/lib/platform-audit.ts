import type { createServiceClient } from '@/lib/supabase/server';

type Service = ReturnType<typeof createServiceClient>;

/**
 * Ghi 1 dòng nhật ký thao tác chủ nền tảng. Không ném lỗi ra ngoài —
 * audit thất bại KHÔNG được làm hỏng nghiệp vụ chính.
 */
export async function writeAudit(
  service: Service,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await service.from('platform_audit_log').insert({
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId,
      detail,
    });
  } catch (e) {
    console.error('[audit] ghi nhật ký thất bại:', e);
  }
}
