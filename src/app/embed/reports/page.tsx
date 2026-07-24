import { createClient } from '@/lib/supabase/server';
import { CAN_VIEW_REPORTS } from '@/lib/nav';
import type { UserRole } from '@/types/database';
import ReportsView from '@/app/(dashboard)/reports/ReportsView';
import { loadReportsProps } from '@/app/(dashboard)/reports/load';
import EmbedAuthBridge from './EmbedAuthBridge';

export const dynamic = 'force-dynamic';

/**
 * Báo cáo CRM dạng NHÚNG (iframe từ Budget /digital). 1 NGUỒN DUY NHẤT với /reports.
 * - Chưa có phiên (cookie CRM): render bridge nhận token từ Budget qua postMessage.
 * - Có phiên + đúng quyền: render đúng <ReportsView> theo vai trò CRM thật của user.
 */
export default async function EmbedReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <EmbedAuthBridge />;

  const { data: me } = await supabase.from('users').select('role, company_id').eq('id', user.id).maybeSingle();
  if (!me?.role || !CAN_VIEW_REPORTS.has(me.role as UserRole)) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Tài khoản này chưa có quyền xem báo cáo trên hệ thống CRM.
      </div>
    );
  }

  // Bản nhúng /digital: lọc theo phạm vi vai trò của user (brand/showroom) + chỉ 2 tab.
  const props = await loadReportsProps(supabase, user, me, sp, { scopeToUser: true });
  return <ReportsView {...props} basePath="/embed/reports" allowedTabs={['overview', 'kpi-targets']} compactKpi />;
}
