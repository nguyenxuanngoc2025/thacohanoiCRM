import { getPlatformSetting } from '@/lib/platform-settings';
import GooglePickerPopup from './GooglePickerPopup';

export const dynamic = 'force-dynamic';

// Trang popup CHẠY Ở APEX trung tâm: cửa sổ chọn Google Sheet (Picker) cần origin đã
// khai 1 lần trong Google Console. Mọi công ty mở popup tới đây để chọn file, rồi gửi
// id file về trang gọi (opener) qua postMessage. Trang công khai (middleware mở /connect).
export default async function GooglePickerPage() {
  const clientId = (await getPlatformSetting('google_oauth_client_id')) ?? '';
  const apiKey = (await getPlatformSetting('google_api_key')) ?? '';
  return <GooglePickerPopup clientId={clientId} apiKey={apiKey} />;
}
