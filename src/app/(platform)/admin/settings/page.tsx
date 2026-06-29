import { redirect } from 'next/navigation';
import { getCurrentRole } from '@/lib/platform-guard';
import { FB_APP_SECRET_KEY, getFbBusinessId, getPlatformSetting } from '@/lib/platform-settings';
import PlatformSettingsForm from './PlatformSettingsForm';

export const dynamic = 'force-dynamic';

export default async function PlatformSettingsPage() {
  const role = await getCurrentRole();
  if (role !== 'platform_owner') redirect('/leads');

  const fbBusinessId = (await getFbBusinessId()) ?? '';
  const googleClientId = (await getPlatformSetting('google_oauth_client_id')) ?? '';
  const googleApiKey = (await getPlatformSetting('google_api_key')) ?? '';
  // KHÔNG truyền giá trị App Secret ra giao diện — chỉ cho biết đã có hay chưa.
  const fbAppSecretSet = Boolean(
    process.env.FB_APP_SECRET?.trim() || (await getPlatformSetting(FB_APP_SECRET_KEY)),
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Cấu hình nền tảng</h1>
        <p className="text-sm text-slate-400 mt-0.5">Thông số dùng chung cho mọi công ty</p>
      </div>
      <PlatformSettingsForm
        fbBusinessId={fbBusinessId}
        fbAppSecretSet={fbAppSecretSet}
        googleClientId={googleClientId}
        googleApiKey={googleApiKey}
      />
    </div>
  );
}
