import { redirect } from 'next/navigation';
import { getCurrentRole } from '@/lib/platform-guard';
import { getFbBusinessId } from '@/lib/platform-settings';
import PlatformSettingsForm from './PlatformSettingsForm';

export const dynamic = 'force-dynamic';

export default async function PlatformSettingsPage() {
  const role = await getCurrentRole();
  if (role !== 'platform_owner') redirect('/leads');

  const fbBusinessId = (await getFbBusinessId()) ?? '';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Cấu hình nền tảng</h1>
        <p className="text-sm text-slate-400 mt-0.5">Thông số dùng chung cho mọi công ty</p>
      </div>
      <PlatformSettingsForm fbBusinessId={fbBusinessId} />
    </div>
  );
}
