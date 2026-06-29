import type { createClient } from '@/lib/supabase/server';

type DbClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Brand mà công ty đang "mở" (whitelist company_brands). Hãng bị đóng (gỡ khỏi
 * whitelist) → không nằm trong tập này → caller dùng để ẩn lead hãng đó khỏi UI.
 * Trả [] khi: công ty NULL (platform_owner) hoặc chưa cấu hình whitelist —
 * caller hiểu [] = "không lọc" (hiện tất cả) để tránh ẩn nhầm toàn bộ.
 * RLS company_brands_select đã giới hạn theo công ty của user nên query này an toàn.
 */
export async function getOpenBrandIds(supabase: DbClient, companyId: string | null): Promise<string[]> {
  if (!companyId) return [];
  const { data } = await supabase.from('company_brands').select('brand_id').eq('company_id', companyId);
  return (data ?? []).map((r) => String((r as { brand_id: string }).brand_id));
}
