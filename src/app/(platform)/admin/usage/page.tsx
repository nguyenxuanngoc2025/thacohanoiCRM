import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentRole } from '@/lib/platform-guard';

export const dynamic = 'force-dynamic';

const fmt = (n: number) => n.toLocaleString('vi-VN');
const startOfMonthISO = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};

export default async function UsagePage() {
  const role = await getCurrentRole();
  if (role !== 'platform_owner') redirect('/leads');

  const service = createServiceClient();
  const monthStart = startOfMonthISO();

  const [{ data: companies }, { data: showrooms }, { data: users }, { data: leads }] =
    await Promise.all([
      service.from('companies').select('id,name,plan_status,max_showrooms').order('name'),
      service.from('showrooms').select('company_id'),
      service.from('users').select('company_id,is_active'),
      service.from('leads').select('company_id,created_at'),
    ]);

  const srCount: Record<string, number> = {};
  for (const s of (showrooms ?? []) as { company_id: string | null }[]) {
    if (s.company_id) srCount[s.company_id] = (srCount[s.company_id] ?? 0) + 1;
  }
  const userCount: Record<string, number> = {};
  for (const u of (users ?? []) as { company_id: string | null; is_active: boolean }[]) {
    if (u.company_id && u.is_active) userCount[u.company_id] = (userCount[u.company_id] ?? 0) + 1;
  }
  const leadMonth: Record<string, number> = {};
  const lastActivity: Record<string, string> = {};
  for (const l of (leads ?? []) as { company_id: string | null; created_at: string }[]) {
    if (!l.company_id) continue;
    if (l.created_at >= monthStart) leadMonth[l.company_id] = (leadMonth[l.company_id] ?? 0) + 1;
    if (!lastActivity[l.company_id] || l.created_at > lastActivity[l.company_id]) lastActivity[l.company_id] = l.created_at;
  }

  const rows = ((companies ?? []) as { id: string; name: string; plan_status: string; max_showrooms: number }[]).map((c) => {
    const used = srCount[c.id] ?? 0;
    const ratio = c.max_showrooms > 0 ? used / c.max_showrooms : 0;
    return {
      ...c, used, ratio,
      users: userCount[c.id] ?? 0,
      leads: leadMonth[c.id] ?? 0,
      last: lastActivity[c.id] ? lastActivity[c.id].slice(0, 10) : '—',
    };
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Sử dụng</h1>
        <p className="text-sm text-slate-400 mt-0.5">Mức dùng vs quota mỗi công ty</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Công ty</th>
              <th className="px-4 py-3 font-medium">Showroom (dùng/quota)</th>
              <th className="px-4 py-3 font-medium">Nhân sự</th>
              <th className="px-4 py-3 font-medium">Lead tháng này</th>
              <th className="px-4 py-3 font-medium">Hoạt động cuối</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const color = c.ratio >= 1 ? '#e11d48' : c.ratio >= 0.8 ? '#d97706' : '#0f172a';
              return (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-800 font-medium">{c.name}</td>
                  <td className="px-4 py-3 font-medium" style={{ color }}>{c.used}/{c.max_showrooms}</td>
                  <td className="px-4 py-3 text-slate-700">{fmt(c.users)}</td>
                  <td className="px-4 py-3 text-slate-700">{fmt(c.leads)}</td>
                  <td className="px-4 py-3 text-slate-500">{c.last}</td>
                  <td className="px-4 py-3">
                    {c.plan_status === 'suspended'
                      ? <span className="px-2 py-0.5 rounded-full text-xs bg-rose-50 text-rose-600">Tạm khóa</span>
                      : <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-600">Hoạt động</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
