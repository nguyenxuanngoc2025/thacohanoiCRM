import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import PhanGiaoClient from './PhanGiaoClient';
import { getOpenBrandIds, isBrandClosed } from '@/lib/company-brands';
import { vnDateStr } from '@/lib/roster';

export const dynamic = 'force-dynamic';

// Trang cấu hình phân giao dành cho Giám đốc Showroom (gd_showroom).
// Chỉ hiện đúng các showroom trong user_showrooms của người đăng nhập + phòng/TVBH/lịch trực
// của các showroom đó. Admin công ty đã có toàn bộ cây này ở /settings → chuyển hướng về đó.
export default async function PhanGiaoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
  if (me?.role === 'admin' || me?.role === 'platform_owner') redirect('/settings');
  if (me?.role !== 'gd_showroom') redirect('/leads');

  const service = createServiceClient();
  const companyId = (me.company_id as string | null) ?? '';
  const NONE = '00000000-0000-0000-0000-000000000000';

  // Phạm vi GĐSR = các showroom trong user_showrooms.
  const { data: myShowroomRows } = await service
    .from('user_showrooms').select('showroom_id').eq('user_id', user.id);
  const myShowroomIds = ((myShowroomRows ?? []) as { showroom_id: string }[]).map((r) => r.showroom_id);
  if (myShowroomIds.length === 0) {
    // Chưa được gán showroom nào → không có gì để cấu hình.
    return (
      <div className="p-3 sm:p-6 space-y-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Cấu hình phân giao</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Đặt cách chia lead trong showroom bạn phụ trách</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400">
          Bạn chưa được gán showroom nào. Liên hệ quản trị công ty để được cấp quyền.
        </div>
      </div>
    );
  }

  // Chỉ lấy showroom thuộc CÔNG TY mình + đang hoạt động (ẩn showroom bị tắt).
  const { data: showroomRows } = await service
    .from('showrooms').select('id, name, code, team_assign_strategy, assign_share_pct, is_active')
    .in('id', myShowroomIds).eq('company_id', companyId).order('name');
  const showroomsActive = ((showroomRows ?? []) as { id: string; is_active: boolean }[])
    .filter((s) => s.is_active !== false) as unknown[];
  const srIds = (showroomsActive as { id: string }[]).map((s) => s.id);
  const srFilter = srIds.length ? srIds : [NONE];

  const [
    { data: showroomBrandRows },
    { data: salesTeamRows },
    { data: rosterRows },
  ] = await Promise.all([
    service.from('showroom_brands').select('showroom_id, brand_id').in('showroom_id', srFilter),
    service.from('sales_teams').select('id, showroom_id, brand_ids, name, head_user_id, is_default, sort_order, tvbh_assign_strategy, assign_share_pct').in('showroom_id', srFilter).order('sort_order'),
    service.from('showroom_day_roster').select('showroom_id, roster_date, sales_team_id').in('showroom_id', srFilter).gte('roster_date', vnDateStr(new Date())).order('roster_date'),
  ]);

  // Ẩn hãng đang tắt (mirror /settings): phòng còn ít nhất 1 hãng mở hoặc chưa gán hãng thì vẫn hiện.
  const openBrandIds = await getOpenBrandIds(service, companyId || null);
  const brandOpen = (bid: string | null | undefined) => !isBrandClosed(openBrandIds, bid ?? null);
  const salesTeamRowsOpen = (salesTeamRows ?? []).filter((t) => {
    const bids = (t as { brand_ids: string[] }).brand_ids ?? [];
    return bids.length === 0 || bids.some((b) => brandOpen(b));
  });
  const showroomBrandRowsOpen = (showroomBrandRows ?? []).filter((r) => brandOpen((r as { brand_id: string }).brand_id));

  // Nhân sự (TVBH) của các phòng trong phạm vi — cho cấp phòng → TVBH.
  const teamIds = (salesTeamRowsOpen as { id: string }[]).map((t) => t.id);
  const { data: staffRows } = teamIds.length
    ? await service.from('users').select('id, full_name, email, role, showroom_id, brand_id, sales_team_id, is_active, assign_share_pct').eq('company_id', companyId).is('deleted_at', null).in('sales_team_id', teamIds)
    : { data: [] as unknown[] };

  const { data: allocRows } = teamIds.length
    ? await service.from('team_allocation').select('sales_team_id, channel, weight').in('sales_team_id', teamIds)
    : { data: [] as { sales_team_id: string; channel: string; weight: number }[] };
  const allocByTeam: Record<string, Record<string, number>> = {};
  for (const a of (allocRows ?? []) as { sales_team_id: string; channel: string; weight: number }[]) {
    (allocByTeam[a.sales_team_id] ??= {})[a.channel] = Number(a.weight);
  }

  const brandIdsBySr: Record<string, string[]> = {};
  for (const r of showroomBrandRowsOpen as { showroom_id: string; brand_id: string }[]) {
    (brandIdsBySr[r.showroom_id] ??= []).push(r.brand_id);
  }
  const showrooms = (showroomsActive as {
    id: string; name: string; code: string | null; team_assign_strategy?: string; assign_share_pct?: number;
  }[]).map((s) => ({
    ...s,
    brand_ids: brandIdsBySr[s.id] ?? [],
    team_assign_strategy: (s.team_assign_strategy ?? 'weighted') as 'least_loaded' | 'round_robin' | 'weighted' | 'day_roster',
    assign_share_pct: Number(s.assign_share_pct) || 0,
  }));

  const salesTeams = (salesTeamRowsOpen as {
    id: string; showroom_id: string; brand_ids: string[]; name: string; head_user_id: string | null; is_default: boolean;
    tvbh_assign_strategy?: string; assign_share_pct?: number;
  }[]).map((t) => ({
    ...t,
    tvbh_assign_strategy: (t.tvbh_assign_strategy ?? 'least_loaded') as 'least_loaded' | 'round_robin' | 'weighted',
    assign_share_pct: Number(t.assign_share_pct) || 0,
    allocations: allocByTeam[t.id] ?? {},
  }));

  const staff = ((staffRows ?? []) as {
    id: string; full_name: string | null; email: string | null; role: string;
    showroom_id: string | null; brand_id: string | null; sales_team_id: string | null;
    is_active: boolean; assign_share_pct?: number;
  }[]).map((u) => ({ ...u, brand_ids: [], showroom_ids: [] }));

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-slate-900">Cấu hình phân giao</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Đặt cách chia lead trong showroom bạn phụ trách</p>
      </div>
      <PhanGiaoClient
        showrooms={showrooms}
        salesTeams={salesTeams}
        staff={staff}
        roster={rosterRows ?? []}
      />
    </div>
  );
}
