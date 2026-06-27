import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentRole } from '@/lib/platform-guard';

export const dynamic = 'force-dynamic';

const ACTION_LABEL: Record<string, string> = {
  'company.create': 'Tạo công ty',
  'company.quota': 'Đổi quota',
  'company.suspend': 'Tạm khóa công ty',
  'company.activate': 'Mở khóa công ty',
  'contract.create': 'Tạo hợp đồng',
  'contract.update': 'Sửa hợp đồng',
  'payment.create': 'Ghi nhận thu',
  'schedule.create': 'Thêm đợt thu dự kiến',
};

export default async function AuditPage() {
  const role = await getCurrentRole();
  if (role !== 'platform_owner') redirect('/leads');

  const service = createServiceClient();
  const { data: logs } = await service
    .from('platform_audit_log')
    .select('id,actor_id,action,target_type,target_id,detail,created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const logList = (logs ?? []) as {
    id: string; actor_id: string | null; action: string; target_type: string;
    target_id: string | null; detail: Record<string, unknown>; created_at: string;
  }[];

  const actorIds = [...new Set(logList.map((l) => l.actor_id).filter(Boolean))] as string[];
  const actorName: Record<string, string> = {};
  if (actorIds.length) {
    const { data: actors } = await service.from('users').select('id,full_name,email').in('id', actorIds);
    for (const a of (actors ?? []) as { id: string; full_name: string | null; email: string }[]) {
      actorName[a.id] = a.full_name || a.email;
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Nhật ký</h1>
        <p className="text-sm text-slate-400 mt-0.5">Audit các thay đổi quota / khóa / hợp đồng (200 mục gần nhất)</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Thời gian</th>
              <th className="px-4 py-3 font-medium">Người thực hiện</th>
              <th className="px-4 py-3 font-medium">Thao tác</th>
              <th className="px-4 py-3 font-medium">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {logList.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Chưa có nhật ký nào.</td></tr>
            ) : logList.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0 align-top">
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(l.created_at).toLocaleString('vi-VN')}</td>
                <td className="px-4 py-3 text-slate-700">{l.actor_id ? (actorName[l.actor_id] ?? '—') : 'Hệ thống'}</td>
                <td className="px-4 py-3 text-slate-800 font-medium">{ACTION_LABEL[l.action] ?? l.action}</td>
                <td className="px-4 py-3 text-slate-500 text-xs font-mono break-all max-w-md">{JSON.stringify(l.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
