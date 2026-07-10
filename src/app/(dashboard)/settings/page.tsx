import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SettingsClient from '@/components/settings/SettingsClient';
import type { ChannelRow } from '@/components/settings/types';
import { getFbBusinessId } from '@/lib/platform-settings';
import { getOpenBrandIds, isBrandClosed } from '@/lib/company-brands';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
  if (me?.role !== 'admin' && me?.role !== 'platform_owner') redirect('/leads');

  // service_role: master catalog (brands/showrooms/channel_accounts) RLS OFF, đọc qua service cho chắc.
  // service_role BỎ QUA RLS → MỌI truy vấn dữ liệu thuộc-công-ty phải tự lọc theo company_id,
  // nếu không admin công ty này sẽ thấy dữ liệu công ty khác.
  const service = createServiceClient();
  const companyId = me.company_id ?? '';
  // UUID không bao giờ trùng — dùng làm sentinel cho .in() khi mảng rỗng (PostgREST từ chối in.()).
  const NONE = '00000000-0000-0000-0000-000000000000';

  // Giai đoạn 1: nhân sự + showroom của ĐÚNG công ty này (làm gốc scope cho phần còn lại).
  const [{ data: staff }, { data: showroomRows }] = await Promise.all([
    service.from('users').select('id, full_name, email, role, showroom_id, brand_id, sales_team_id, is_active, assign_share_pct').eq('company_id', companyId).is('deleted_at', null).order('role'),
    service.from('showrooms').select('id, name, code, team_assign_strategy, assign_share_pct').eq('company_id', companyId).order('name'),
  ]);
  const srIds = ((showroomRows ?? []) as { id: string }[]).map((s) => s.id);
  const srFilter = srIds.length ? srIds : [NONE];
  const userIds = ((staff ?? []) as { id: string }[]).map((u) => u.id);
  const userFilter = userIds.length ? userIds : [NONE];

  // Giai đoạn 2: phần còn lại — brand/models DÙNG CHUNG toàn cục; còn lại lọc theo showroom/user của công ty.
  const [
    { data: showroomBrandRows },
    { data: brands },
    { data: models },
    { data: channels },
    { data: channelShowroomRows },
    { data: assignmentRules },
    { data: slaConfig },
    { data: notifChannels },
    { data: recentLogs },
    { data: leadStatusRows },
    { data: salesTeamRows },
    { data: userBrandRows },
    { data: userShowroomRows },
  ] = await Promise.all([
    service.from('showroom_brands').select('showroom_id, brand_id').in('showroom_id', srFilter),
    service.from('brands').select('id, name, slug').order('name'),
    service.from('models').select('id, brand_id, name, sort_order, is_active, keywords').order('sort_order'),
    service.from('channel_accounts').select('id, page_name, platform, page_id, showroom_id, brand_id, campaign, showroom_assign_strategy, is_active, config').in('showroom_id', srFilter).order('created_at', { ascending: false }),
    service.from('channel_account_showrooms').select('channel_account_id, showroom_id, share_pct').in('showroom_id', srFilter),
    service.from('assignment_rules').select('id, showroom_id, strategy, specific_user_id, is_active, priority').eq('company_id', companyId).order('priority', { ascending: false }),
    service.from('sla_config').select('id, round, first_response_hours, follow_up_hours, is_active').eq('company_id', companyId).order('round'),
    service.from('notification_channels').select('id, channel, name, target, events, is_active, showroom_id, sales_team_id, scope').eq('company_id', companyId).order('created_at', { ascending: false }),
    service.from('lead_logs').select('id, lead_id, user_id, type, content, old_status, new_status, created_at').in('user_id', userFilter).order('created_at', { ascending: false }).limit(50),
    service.from('leads').select('status').eq('company_id', companyId),
    service.from('sales_teams').select('id, showroom_id, brand_id, name, head_user_id, is_default, sort_order, tvbh_assign_strategy, assign_share_pct').eq('company_id', companyId).order('sort_order'),
    service.from('user_brands').select('user_id, brand_id').in('user_id', userFilter),
    service.from('user_showrooms').select('user_id, showroom_id').in('user_id', userFilter),
  ]);

  // Hãng đang TẮT (gỡ khỏi whitelist company_brands) → ẩn sạch khỏi Cài đặt: brand/models/kênh/
  // phòng/kênh-thông-báo của hãng đó không hiển thị. platform_owner (companyId rỗng) → [] = không lọc.
  const openBrandIds = await getOpenBrandIds(service, companyId || null);
  const brandOpen = (bid: string | null | undefined) => !isBrandClosed(openBrandIds, bid ?? null);
  const brandsOpen = (brands ?? []).filter((b) => brandOpen((b as { id: string }).id));
  const modelsOpen = (models ?? []).filter((m) => brandOpen((m as { brand_id: string }).brand_id));
  const salesTeamRowsOpen = (salesTeamRows ?? []).filter((t) => brandOpen((t as { brand_id: string }).brand_id));
  const channelsOpen = (channels ?? []).filter((c) => brandOpen((c as { brand_id: string | null }).brand_id));
  const showroomBrandRowsOpen = (showroomBrandRows ?? []).filter((r) => brandOpen((r as { brand_id: string }).brand_id));
  const openTeamIds = new Set(salesTeamRowsOpen.map((t) => String((t as { id: string }).id)));
  const notifChannelsOpen = (notifChannels ?? []).filter((c) => {
    const ch = c as { scope: string; sales_team_id: string | null };
    return ch.scope !== 'sales' || !ch.sales_team_id || openTeamIds.has(String(ch.sales_team_id));
  });

  // Gom phạm vi đa phần (bảng phụ) cho mỗi user → đính vào staff cho UI hiển thị + prefill form.
  const brandIdsByUser: Record<string, string[]> = {};
  for (const r of (userBrandRows ?? []) as { user_id: string; brand_id: string }[]) {
    (brandIdsByUser[r.user_id] ??= []).push(r.brand_id);
  }
  const showroomIdsByUser: Record<string, string[]> = {};
  for (const r of (userShowroomRows ?? []) as { user_id: string; showroom_id: string }[]) {
    (showroomIdsByUser[r.user_id] ??= []).push(r.showroom_id);
  }
  const staffWithScope = (staff ?? []).map((u) => ({
    ...u,
    brand_ids: brandIdsByUser[u.id] ?? [],
    showroom_ids: showroomIdsByUser[u.id] ?? [],
  }));

  // Trọng số phân bổ theo kênh cho từng phòng (gom vào sales_teams)
  const teamIds = (salesTeamRowsOpen as { id: string }[]).map((t) => t.id);
  const { data: allocRows } = teamIds.length
    ? await service.from('team_allocation').select('sales_team_id, channel, weight').in('sales_team_id', teamIds)
    : { data: [] as { sales_team_id: string; channel: string; weight: number }[] };
  const allocByTeam: Record<string, Record<string, number>> = {};
  for (const a of (allocRows ?? []) as { sales_team_id: string; channel: string; weight: number }[]) {
    (allocByTeam[a.sales_team_id] ??= {})[a.channel] = Number(a.weight);
  }
  const salesTeams = (salesTeamRowsOpen as {
    id: string; showroom_id: string; brand_id: string; name: string; head_user_id: string | null; is_default: boolean;
    tvbh_assign_strategy?: string; assign_share_pct?: number;
  }[]).map((t) => ({
    ...t,
    tvbh_assign_strategy: (t.tvbh_assign_strategy ?? 'least_loaded') as 'least_loaded' | 'round_robin' | 'weighted',
    assign_share_pct: Number(t.assign_share_pct) || 0,
    allocations: allocByTeam[t.id] ?? {},
  }));

  // Đếm lead theo trạng thái (phục vụ trang Trạng thái lead)
  const statusCounts: Record<string, number> = {};
  for (const r of leadStatusRows ?? []) {
    const s = (r as { status: string }).status;
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  // Gom danh sách thương hiệu cho mỗi showroom (bảng junction showroom_brands)
  const brandIdsBySr: Record<string, string[]> = {};
  for (const r of showroomBrandRowsOpen as { showroom_id: string; brand_id: string }[]) {
    (brandIdsBySr[r.showroom_id] ??= []).push(r.brand_id);
  }
  const showrooms = ((showroomRows ?? []) as {
    id: string; name: string; code: string | null; team_assign_strategy?: string; assign_share_pct?: number;
  }[]).map((s) => ({
    ...s,
    brand_ids: brandIdsBySr[s.id] ?? [],
    team_assign_strategy: (s.team_assign_strategy ?? 'weighted') as 'least_loaded' | 'round_robin' | 'weighted',
    assign_share_pct: Number(s.assign_share_pct) || 0,
  }));

  // Gom danh sách showroom + % phân bổ cho mỗi kênh (bảng junction channel_account_showrooms)
  const showroomIdsByChannel: Record<string, string[]> = {};
  const sharesByChannel: Record<string, Record<string, number>> = {};
  for (const r of (channelShowroomRows ?? []) as { channel_account_id: string; showroom_id: string; share_pct?: number }[]) {
    (showroomIdsByChannel[r.channel_account_id] ??= []).push(r.showroom_id);
    (sharesByChannel[r.channel_account_id] ??= {})[r.showroom_id] = Number(r.share_pct) || 0;
  }
  const channelsWithShowrooms: ChannelRow[] = (channelsOpen as Omit<ChannelRow, 'showroom_ids'>[])
    .map((c) => ({
      ...c,
      showroom_ids: showroomIdsByChannel[c.id] ?? (c.showroom_id ? [c.showroom_id] : []),
      showroom_shares: sharesByChannel[c.id] ?? {},
    }));

  // Business ID nền tảng (dùng chung) — hiển thị trong hướng dẫn kết nối Facebook.
  const fbBusinessId = (await getFbBusinessId()) ?? '';
  // Trạng thái kết nối Google của công ty này (Client ID/API Key dùng chung nền tảng,
  // OAuth + Picker chạy qua apex trung tâm nên không cần truyền xuống client nữa).
  const { data: googleConn } = await service.from('google_connections').select('id').eq('company_id', companyId).maybeSingle();
  const googleConnected = !!googleConn;

  // Trạng thái con bot Zalo (gửi thông báo) của công ty này.
  const { data: zaloBotRow } = await service
    .from('zalo_bot_sessions')
    .select('status, display_name, last_error')
    .eq('company_id', companyId)
    .maybeSingle();
  const zaloBotSession = {
    status: (zaloBotRow?.status ?? 'disconnected') as 'connected' | 'disconnected',
    displayName: zaloBotRow?.display_name ?? null,
    lastError: zaloBotRow?.last_error ?? null,
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-slate-900">Cài đặt hệ thống</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Quản lý nhân sự, tích hợp kênh và cấu hình nghiệp vụ</p>
      </div>

      <SettingsClient
        staff={staffWithScope}
        showrooms={showrooms ?? []}
        brands={brandsOpen}
        models={modelsOpen}
        salesTeams={salesTeams ?? []}
        companyId={companyId}
        currentUserId={user.id}
        channels={channelsWithShowrooms}
        assignmentRules={assignmentRules ?? []}
        slaConfig={slaConfig ?? []}
        notifChannels={notifChannelsOpen}
        recentLogs={recentLogs ?? []}
        statusCounts={statusCounts}
        fbBusinessId={fbBusinessId}
        googleConnected={googleConnected}
        zaloBotSession={zaloBotSession}
      />
    </div>
  );
}
