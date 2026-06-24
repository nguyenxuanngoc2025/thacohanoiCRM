import { createClient, createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SettingsClient from '@/components/settings/SettingsClient';
import type { ChannelRow } from '@/components/settings/types';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
  if (me?.role !== 'admin') redirect('/leads');

  // service_role: master catalog (brands/showrooms/channel_accounts) RLS OFF, đọc qua service cho chắc
  const service = createServiceClient();
  const companyId = me.company_id ?? '';

  const [
    { data: staff },
    { data: showroomRows },
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
  ] = await Promise.all([
    service.from('users').select('id, full_name, email, role, showroom_id, brand_id, is_active').order('role'),
    service.from('showrooms').select('id, name, code').order('name'),
    service.from('showroom_brands').select('showroom_id, brand_id'),
    service.from('brands').select('id, name, slug').order('name'),
    service.from('models').select('id, brand_id, name, sort_order, is_active').order('sort_order'),
    service.from('channel_accounts').select('id, page_name, platform, page_id, showroom_id, brand_id, campaign, is_active').order('created_at', { ascending: false }),
    service.from('channel_account_showrooms').select('channel_account_id, showroom_id'),
    service.from('assignment_rules').select('id, showroom_id, strategy, specific_user_id, is_active, priority').order('priority', { ascending: false }),
    service.from('sla_config').select('id, round, first_response_hours, follow_up_hours, is_active').order('round'),
    service.from('notification_channels').select('id, channel, name, target, events, is_active, showroom_id, scope').order('created_at', { ascending: false }),
    service.from('lead_logs').select('id, lead_id, user_id, type, content, old_status, new_status, created_at').order('created_at', { ascending: false }).limit(50),
    service.from('leads').select('status').eq('company_id', companyId),
  ]);

  // Đếm lead theo trạng thái (phục vụ trang Trạng thái lead)
  const statusCounts: Record<string, number> = {};
  for (const r of leadStatusRows ?? []) {
    const s = (r as { status: string }).status;
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  // Gom danh sách thương hiệu cho mỗi showroom (bảng junction showroom_brands)
  const brandIdsBySr: Record<string, string[]> = {};
  for (const r of (showroomBrandRows ?? []) as { showroom_id: string; brand_id: string }[]) {
    (brandIdsBySr[r.showroom_id] ??= []).push(r.brand_id);
  }
  const showrooms = ((showroomRows ?? []) as { id: string; name: string; code: string | null }[])
    .map((s) => ({ ...s, brand_ids: brandIdsBySr[s.id] ?? [] }));

  // Gom danh sách showroom cho mỗi kênh (bảng junction channel_account_showrooms)
  const showroomIdsByChannel: Record<string, string[]> = {};
  for (const r of (channelShowroomRows ?? []) as { channel_account_id: string; showroom_id: string }[]) {
    (showroomIdsByChannel[r.channel_account_id] ??= []).push(r.showroom_id);
  }
  const channelsWithShowrooms: ChannelRow[] = ((channels ?? []) as Omit<ChannelRow, 'showroom_ids'>[])
    .map((c) => ({ ...c, showroom_ids: showroomIdsByChannel[c.id] ?? (c.showroom_id ? [c.showroom_id] : []) }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Cài đặt hệ thống</h1>
        <p className="text-sm text-slate-400 mt-0.5">Quản lý nhân sự, tích hợp kênh và cấu hình nghiệp vụ</p>
      </div>

      <SettingsClient
        staff={staff ?? []}
        showrooms={showrooms ?? []}
        brands={brands ?? []}
        models={models ?? []}
        companyId={companyId}
        currentUserId={user.id}
        channels={channelsWithShowrooms}
        assignmentRules={assignmentRules ?? []}
        slaConfig={slaConfig ?? []}
        notifChannels={notifChannels ?? []}
        recentLogs={recentLogs ?? []}
        statusCounts={statusCounts}
      />
    </div>
  );
}
