import { redirect } from 'next/navigation';
import { getCurrentRole } from '@/lib/platform-guard';
import CronManager from './CronManager';

export const dynamic = 'force-dynamic';

export default async function CronPage() {
  const role = await getCurrentRole();
  if (role !== 'platform_owner') redirect('/leads');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Tác vụ tự động (Cron)</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Bật/tắt, đổi lịch, chạy ngay mọi tác vụ định kỳ trên máy chủ. Giờ hiển thị theo giờ Việt Nam.
        </p>
      </div>
      <CronManager />
    </div>
  );
}
