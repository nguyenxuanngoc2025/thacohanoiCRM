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
 * sales_team_id[] thuộc các hãng ĐÓNG hoặc showroom TẮT của công ty — dùng để lọc
 * kênh thông báo scope='sales' (cron nhắc hạn / báo cáo ngày).
 * Whitelist rỗng VÀ không có showroom tắt / company NULL → [] (không phòng nào bị tắt tiếng).
 */
export async function getMutedTeamIds(supabase: DbClient, companyId: string | null): Promise<string[]> {
  if (!companyId) return [];
  const openBrandIds = await getOpenBrandIds(supabase, companyId);
  const inactiveSr = new Set(await getInactiveShowroomIds(supabase, companyId));
  if (openBrandIds.length === 0 && inactiveSr.size === 0) return [];
  const { data } = await supabase
    .from('sales_teams')
    .select('id, brand_id, showroom_id')
    .eq('company_id', companyId);
  return (data ?? [])
    .filter((t) => {
      const row = t as { brand_id: string; showroom_id: string | null };
      return isBrandClosed(openBrandIds, String(row.brand_id)) || inactiveSr.has(String(row.showroom_id));
    })
    .map((t) => String((t as { id: string }).id));
}

/**
 * Tập sales_team_id đóng của TẤT CẢ công ty (dùng cho cron chạy cross-company như
 * nhắc hạn). Team đóng = công ty có whitelist non-empty MÀ brand không trong whitelist,
 * HOẶC showroom của team đang TẮT (is_active=false). Công ty không cấu hình → không team nào đóng.
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
  const { data: srRows } = await supabase.from('showrooms').select('id, is_active');
  const inactiveSr = new Set<string>();
  for (const s of srRows ?? []) {
    if ((s as { is_active: boolean }).is_active === false) inactiveSr.add(String((s as { id: string }).id));
  }
  const { data: teams } = await supabase.from('sales_teams').select('id, company_id, brand_id, showroom_id');
  const muted = new Set<string>();
  for (const t of teams ?? []) {
    const row = t as { id: string; company_id: string; brand_id: string; showroom_id: string | null };
    const open = openByCompany.get(String(row.company_id));
    const brandMuted = !!open && open.size > 0 && !open.has(String(row.brand_id));
    const srMuted = inactiveSr.has(String(row.showroom_id));
    if (brandMuted || srMuted) muted.add(String(row.id));
  }
  return muted;
}

/**
 * Showroom có đang bị TẮT không (theo danh sách showroom inactive của công ty).
 * Ngược nghĩa isBrandClosed: ở đây danh sách là tập ĐÓNG (inactive), check IN.
 * showroomId null → false (không có showroom để chặn).
 */
export function isShowroomInactive(inactiveShowroomIds: string[], showroomId: string | null): boolean {
  return !!showroomId && inactiveShowroomIds.includes(showroomId);
}

/**
 * showroom_id[] đang TẮT của 1 công ty. Company NULL → [] (platform_owner không lọc).
 */
export async function getInactiveShowroomIds(supabase: DbClient, companyId: string | null): Promise<string[]> {
  if (!companyId) return [];
  const { data } = await supabase
    .from('showrooms')
    .select('id, is_active')
    .eq('company_id', companyId);
  return (data ?? [])
    .filter((s) => (s as { is_active: boolean }).is_active === false)
    .map((s) => String((s as { id: string }).id));
}

/**
 * Tập showroom_id đang TẮT của TẤT CẢ công ty (dùng cho cron cross-company).
 */
export async function getInactiveShowroomIdsGlobal(supabase: DbClient): Promise<Set<string>> {
  const { data } = await supabase.from('showrooms').select('id, is_active');
  const set = new Set<string>();
  for (const s of data ?? []) {
    if ((s as { is_active: boolean }).is_active === false) set.add(String((s as { id: string }).id));
  }
  return set;
}
