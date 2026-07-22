import webpush from 'web-push';
import type { createServiceClient } from '@/lib/supabase/server';

type Service = ReturnType<typeof createServiceClient>;

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

// Cấu hình VAPID 1 lần (idempotent). Thiếu khoá → không cấu hình (gửi sẽ no-op an toàn).
let configured = false;
function ensureVapid(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@crmthacoauto.com';
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

interface SubRow { id: string; endpoint: string; p256dh: string; auth: string }

/**
 * Gửi push tới MỌI thiết bị của các user (trong đúng company_id → không rò chéo tenant).
 * Fire-and-forget: nuốt mọi lỗi, KHÔNG ném ra luồng gọi (ingest/cron). Lỗi 404/410 → xoá sub chết.
 */
export async function sendPushToUsers(
  service: Service,
  companyId: string | null,
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  try {
    if (userIds.length === 0 || !companyId) return;
    if (!ensureVapid()) return;

    const { data } = await service
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', userIds)
      .eq('company_id', companyId);
    const subs = (data ?? []) as SubRow[];
    if (subs.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await service.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }));
  } catch {
    // Nuốt lỗi — push không bao giờ làm hỏng luồng chính.
  }
}
