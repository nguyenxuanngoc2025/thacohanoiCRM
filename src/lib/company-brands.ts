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

/**
 * Hãng có đang bị đóng không (theo whitelist open brands của công ty).
 * Nguyên tắc []: whitelist rỗng → coi là "không lọc" → mọi hãng đều mở (false).
 * brandId null → không có hãng để chặn → false.
 */
export function isBrandClosed(openBrandIds: string[], brandId: string | null): boolean {
  return openBrandIds.length > 0 && !!brandId && !openBrandIds.includes(brandId);
}

/**
 * sales_team_id[] thuộc các hãng ĐÓNG của công ty — dùng để lọc kênh thông báo
 * scope='sales' của hãng đóng (cron nhắc hạn / báo cáo ngày).
 * Whitelist rỗng / company NULL → [] (không có phòng nào bị tắt tiếng).
 */
export async function getMutedTeamIds(supabase: DbClient, companyId: string | null): Promise<string[]> {
  if (!companyId) return [];
  const openBrandIds = await getOpenBrandIds(supabase, companyId);
  if (openBrandIds.length === 0) return [];
  const { data } = await supabase
    .from('sales_teams')
    .select('id, brand_id')
    .eq('company_id', companyId);
  return (data ?? [])
    .filter((t) => isBrandClosed(openBrandIds, String((t as { brand_id: string }).brand_id)))
    .map((t) => String((t as { id: string }).id));
}

/**
 * Tập sales_team_id đóng của TẤT CẢ công ty (dùng cho cron chạy cross-company như
 * nhắc hạn). Team đóng = công ty của nó có whitelist non-empty MÀ brand của team
 * không nằm trong whitelist. Công ty không cấu hình whitelist → không team nào đóng.
 */
export async function getMutedTeamIdsGlobal(supabase: DbClient): Promise<Set<string>> {
  const { data: cb } = await supabase.from('company_brands').select('company_id, brand_id');
  const openByCompany = new Map<string, Set<string>>();
  for (const r of cb ?? []) {
    const row = r as { company_id: string; brand_id: string };
    const set = openByCompany.get(String(row.company_id)) ?? new Set<string>();
    set.add(String(row.brand_id));
    openByCompany.set(String(row.company_id), set);
  }
  const { data: teams } = await supabase.from('sales_teams').select('id, company_id, brand_id');
  const muted = new Set<string>();
  for (const t of teams ?? []) {
    const row = t as { id: string; company_id: string; brand_id: string };
    const open = openByCompany.get(String(row.company_id));
    if (open && open.size > 0 && !open.has(String(row.brand_id))) muted.add(String(row.id));
  }
  return muted;
}
