import { createClient } from '@/lib/supabase/server';
import { formatPhoneDisplay } from '@/lib/phone';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  KHQT: 'bg-blue-50 text-blue-700 border-blue-200',
  GDTD: 'bg-amber-50 text-amber-700 border-amber-200',
  'KHĐ': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Chưa LH được': 'bg-slate-100 text-slate-600 border-slate-200',
  Fail: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default async function LeadsPage() {
  const supabase = await createClient();
  const { data: leads } = await supabase
    .from('leads')
    .select('id, full_name, phone, source, status, round, created_at, assigned_to')
    .order('created_at', { ascending: false })
    .limit(200);

  const total = leads?.length ?? 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Danh sách lead</h1>
          <p className="text-xs text-slate-400 mt-0.5">Khách hàng tiềm năng từ các kênh</p>
        </div>
        <span className="text-sm font-semibold text-[#004B9B] bg-blue-50 rounded-full px-3 py-1">{total} lead</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
          <tr>
            <th className="px-6 py-3 font-semibold">Khách hàng</th>
            <th className="px-4 py-3 font-semibold">SĐT</th>
            <th className="px-4 py-3 font-semibold">Nguồn</th>
            <th className="px-4 py-3 font-semibold">Trạng thái</th>
            <th className="px-4 py-3 font-semibold">Vòng</th>
            <th className="px-4 py-3 font-semibold">Thời gian</th>
          </tr>
        </thead>
        <tbody>
          {(leads ?? []).map((l) => (
            <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
              <td className="px-6 py-3 font-medium text-slate-800">{l.full_name ?? '—'}</td>
              <td className="px-4 py-3 text-slate-600">{formatPhoneDisplay(l.phone)}</td>
              <td className="px-4 py-3 text-slate-500">{l.source ?? '—'}</td>
              <td className="px-4 py-3">
                <span className={`inline-block text-xs font-medium border rounded-full px-2.5 py-0.5 ${STATUS_STYLE[l.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  {l.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-500">{l.round}</td>
              <td className="px-4 py-3 text-slate-500">{new Date(l.created_at).toLocaleString('vi-VN')}</td>
            </tr>
          ))}
          {total === 0 && (
            <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Chưa có lead nào.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
