import { createClient } from '@/lib/supabase/server';
import { formatPhoneDisplay } from '@/lib/phone';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const supabase = await createClient();
  const { data: leads } = await supabase
    .from('leads')
    .select('id, full_name, phone, source, status, round, created_at, assigned_to')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <h1 className="text-lg font-bold text-gray-900 px-6 py-4 border-b">Danh sách lead</h1>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-left">
          <tr>
            <th className="px-4 py-2">Khách hàng</th>
            <th className="px-4 py-2">SĐT</th>
            <th className="px-4 py-2">Nguồn</th>
            <th className="px-4 py-2">Trạng thái</th>
            <th className="px-4 py-2">Vòng</th>
            <th className="px-4 py-2">Thời gian</th>
          </tr>
        </thead>
        <tbody>
          {(leads ?? []).map((l) => (
            <tr key={l.id} className="border-t">
              <td className="px-4 py-2">{l.full_name ?? '—'}</td>
              <td className="px-4 py-2">{formatPhoneDisplay(l.phone)}</td>
              <td className="px-4 py-2">{l.source ?? '—'}</td>
              <td className="px-4 py-2">{l.status}</td>
              <td className="px-4 py-2">{l.round}</td>
              <td className="px-4 py-2">{new Date(l.created_at).toLocaleString('vi-VN')}</td>
            </tr>
          ))}
          {(!leads || leads.length === 0) && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Chưa có lead.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
