import { createServiceClient } from '@/lib/supabase/server';

/** Đọc một giá trị cấu hình nền tảng (dùng chung mọi công ty). */
export async function getPlatformSetting(key: string): Promise<string | null> {
  const service = createServiceClient();
  const { data } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  return (data as { value: string | null } | null)?.value ?? null;
}

/** Ghi một giá trị cấu hình nền tảng (upsert theo key). Chỉ gọi từ server (service_role). */
export async function setPlatformSetting(key: string, value: string): Promise<void> {
  const service = createServiceClient();
  await service
    .from('platform_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

/** Đọc nhiều giá trị cấu hình nền tảng cùng lúc → map key→value. */
export async function getPlatformSettings(keys: string[]): Promise<Record<string, string | null>> {
  const service = createServiceClient();
  const { data } = await service
    .from('platform_settings')
    .select('key, value')
    .in('key', keys);
  const map: Record<string, string | null> = {};
  for (const row of (data ?? []) as { key: string; value: string | null }[]) map[row.key] = row.value;
  return map;
}

// Mốc chạy gần nhất của cron quét Facebook (nhịp tim — để dashboard/watchdog biết cron còn sống).
export const FB_POLL_MESSAGES_HEARTBEAT_KEY = 'fb_poll_messages_last_run';
export const FB_POLL_COMMENTS_HEARTBEAT_KEY = 'fb_poll_comments_last_run';

/** Business ID của BM nền tảng — hiển thị trong hướng dẫn kết nối Facebook. */
export const FB_BUSINESS_ID_KEY = 'fb_business_id';
export const getFbBusinessId = () => getPlatformSetting(FB_BUSINESS_ID_KEY);

/**
 * App Secret của Facebook App — dùng để kiểm chữ ký webhook (X-Hub-Signature-256).
 * Ưu tiên biến môi trường FB_APP_SECRET (nếu máy chủ đã đặt), nếu chưa thì lấy từ cấu hình
 * nền tảng do chủ nền tảng nhập trong giao diện. Trả null khi cả hai đều trống.
 */
export const FB_APP_SECRET_KEY = 'fb_app_secret';
export async function getFbAppSecret(): Promise<string | null> {
  const fromEnv = process.env.FB_APP_SECRET?.trim();
  if (fromEnv) return fromEnv;
  return getPlatformSetting(FB_APP_SECRET_KEY);
}
