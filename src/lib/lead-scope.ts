// Phạm vi tạo lead theo cấp người dùng.
// Xác định người tạo được chọn showroom/hãng/phòng nào → form ẩn/giới hạn ô,
// và server kiểm lại (không tin client). Dùng cột users + junction user_showrooms/user_brands
// + sales_teams.brand_ids sẵn có (KHÔNG migration).

import { createClient } from '@/lib/supabase/server';
import { ROLE_SCOPE_KIND, type ViewScope } from '@/lib/nav';
import { type UserRole } from '@/types/database';

type Db = Awaited<ReturnType<typeof createClient>>;

export interface CreatorScope {
  kind: ViewScope;               // company | brand | showroom | team
  showroomIds: string[] | null;  // null = mọi showroom công ty; list = giới hạn
  brandIds: string[] | null;     // null = mọi hãng; list = giới hạn
  teamId: string | null;         // phòng cố định (tp_phong); else null
}

/**
 * Suy phạm vi tạo lead của người đăng nhập theo vai trò:
 * - company (admin, gd_cty): không giới hạn.
 * - brand (gd_brand, tp_brand): giới hạn theo user_brands.
 * - showroom (gd_showroom): giới hạn theo user_showrooms.
 * - team (tp_phong) & assigned (tvbh): cố định phòng của họ (+ showroom + tập hãng của phòng).
 */
export async function resolveCreatorScope(db: Db, userId: string): Promise<CreatorScope | null> {
  const { data: me } = await db
    .from('users')
    .select('role, sales_team_id')
    .eq('id', userId)
    .maybeSingle();
  if (!me?.role) return null;

  const kind = ROLE_SCOPE_KIND[me.role as UserRole];

  if (kind === 'brand') {
    const { data: rows } = await db.from('user_brands').select('brand_id').eq('user_id', userId);
    return { kind, showroomIds: null, brandIds: (rows ?? []).map((r) => r.brand_id as string), teamId: null };
  }

  if (kind === 'showroom') {
    const { data: rows } = await db.from('user_showrooms').select('showroom_id').eq('user_id', userId);
    return { kind, showroomIds: (rows ?? []).map((r) => r.showroom_id as string), brandIds: null, teamId: null };
  }

  // tp_phong (team) và tvbh (assigned) đều gắn 1 phòng qua users.sales_team_id → khoá đúng phòng đó.
  if (kind === 'team' || kind === 'assigned') {
    const teamId = (me.sales_team_id as string | null) ?? null;
    if (!teamId) return { kind, showroomIds: [], brandIds: [], teamId: null };
    const { data: team } = await db
      .from('sales_teams')
      .select('showroom_id, brand_ids')
      .eq('id', teamId)
      .maybeSingle();
    return {
      kind,
      showroomIds: team?.showroom_id ? [team.showroom_id as string] : [],
      brandIds: (team?.brand_ids as string[] | null) ?? [],
      teamId,
    };
  }

  // company (và các vai trò còn lại có quyền tạo)
  return { kind: 'company', showroomIds: null, brandIds: null, teamId: null };
}

/**
 * Kiểm phía server: lựa chọn showroom/hãng/phòng có nằm trong phạm vi người tạo không.
 * Trả chuỗi lỗi (tiếng Việt) nếu vượt phạm vi, hoặc null nếu hợp lệ. Thuần → test được.
 */
export function assertLeadInScope(
  scope: CreatorScope,
  sel: { showroomId: string | null; brandId: string | null; salesTeamId: string | null },
): string | null {
  if (scope.brandIds !== null && sel.brandId && !scope.brandIds.includes(sel.brandId)) {
    return 'Thương hiệu ngoài phạm vi của bạn.';
  }
  if (scope.showroomIds !== null && sel.showroomId && !scope.showroomIds.includes(sel.showroomId)) {
    return 'Showroom ngoài phạm vi của bạn.';
  }
  if (scope.teamId && sel.salesTeamId && sel.salesTeamId !== scope.teamId) {
    return 'Phòng ngoài phạm vi của bạn.';
  }
  return null;
}
