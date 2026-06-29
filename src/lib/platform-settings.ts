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
