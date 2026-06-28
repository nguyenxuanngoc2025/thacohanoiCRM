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
