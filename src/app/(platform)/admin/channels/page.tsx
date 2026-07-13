import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentRole } from '@/lib/platform-guard';
import LeadSourceManager from '@/components/platform/LeadSourceManager';
import type { SourceChannelRow } from '@/lib/source-catalog';

export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  const role = await getCurrentRole();
  if (role !== 'platform_owner') redirect('/leads');

  const service = createServiceClient();
  const { data } = await service
    .from('lead_source_channels')
    .select('id, platform_key, platform_name, value, label, is_builtin, is_active, digital, sort_order')
    .order('sort_order');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Nguồn &amp; kênh lead</h1>
        <p className="text-sm text-slate-400 mt-0.5">Danh mục dùng chung mọi công ty — chỉ Chủ nền tảng được sửa. Kênh hệ thống khoá mã &amp; không xoá.</p>
      </div>
      <LeadSourceManager rows={(data ?? []) as (SourceChannelRow & { id: string })[]} />
    </div>
  );
}
