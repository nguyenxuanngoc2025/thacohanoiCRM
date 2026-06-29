'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PlatformSettingsForm({
  fbBusinessId, fbAppSecretSet, googleClientId, googleApiKey,
}: { fbBusinessId: string; fbAppSecretSet: boolean; googleClientId: string; googleApiKey: string }) {
  return (
    <div className="space-y-5">
      <SettingCard
        title="Mã doanh nghiệp Facebook (Business ID)"
        hint="Mã Business Manager của nền tảng. Các công ty sẽ cấp quyền fanpage cho mã này để CRM nhận lead. Lấy trong Cài đặt doanh nghiệp Facebook → Thông tin doanh nghiệp. Đổi mã thì dán lại rồi Lưu."
        settingKey="fb_business_id"
        initial={fbBusinessId}
        placeholder="Ví dụ: 1234567890123456"
        savedMsg="Đã lưu. Mã sẽ hiển thị trong hướng dẫn kết nối Facebook của các công ty."
      />
      <SettingCard
        title="Facebook App Secret"
        hint="Khoá bí mật của Facebook App nền tảng — dùng để xác thực lead webhook (chống lead giả). Lấy trong Facebook for Developers → App của bạn → Cài đặt → Cơ bản → Khoá bí mật của ứng dụng. Dán vào rồi Lưu. Vì lý do bảo mật, hệ thống không hiển thị lại khoá đã lưu."
        settingKey="fb_app_secret"
        initial=""
        isSecret
        secretSet={fbAppSecretSet}
        placeholder="Dán App Secret vào đây"
        savedMsg="Đã lưu App Secret. Webhook lead sẽ bắt đầu kiểm chữ ký chống lead giả."
      />
      <SettingCard
        title="Google OAuth Client ID"
        hint="Tạo trong Google Cloud Console → OAuth client (loại Web). Dùng cho luồng kết nối Google Sheet và cửa sổ chọn sheet (Picker)."
        settingKey="google_oauth_client_id"
        initial={googleClientId}
        placeholder="Ví dụ: 1234-abcd.apps.googleusercontent.com"
        savedMsg="Đã lưu Google Client ID."
      />
      <SettingCard
        title="Google API Key"
        hint="Tạo trong Google Cloud Console → API key. Dùng cho cửa sổ chọn Google Sheet (Picker)."
        settingKey="google_api_key"
        initial={googleApiKey}
        placeholder="Ví dụ: AIza..."
        savedMsg="Đã lưu Google API Key."
      />
    </div>
  );
}

function SettingCard({
  title, hint, settingKey, initial, placeholder, savedMsg, isSecret = false, secretSet = false,
}: {
  title: string; hint: string; settingKey: string; initial: string; placeholder: string;
  savedMsg: string; isSecret?: boolean; secretSet?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    const trimmed = value.trim();
    // Khoá bí mật: bỏ trống = giữ nguyên giá trị cũ (tránh lỡ tay xoá khi không nhập lại).
    if (isSecret && !trimmed) {
      setMsg({ ok: false, text: 'Hãy dán khoá vào ô rồi mới bấm Lưu.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/platform/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: settingKey, value: trimmed }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: json?.error ?? 'Lưu thất bại.' });
      return;
    }
    if (isSecret) setValue(''); // không giữ khoá trong ô sau khi lưu
    setMsg({ ok: true, text: savedMsg });
    router.refresh();
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 max-w-xl space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{hint}</p>
      </div>
      {isSecret && secretSet && (
        <p className="text-xs text-emerald-600">Đã lưu một khoá. Để trống nếu không muốn thay đổi.</p>
      )}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        type={isSecret ? 'password' : 'text'}
        autoComplete={isSecret ? 'new-password' : undefined}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-[#004B9B]"
      />
      {msg && (
        <div
          className="text-sm rounded-lg px-3 py-2 border"
          style={{
            background: msg.ok ? '#ecfdf5' : '#fef2f2',
            color: msg.ok ? '#047857' : '#dc2626',
            borderColor: msg.ok ? '#a7f3d0' : '#fecaca',
          }}
        >
          {msg.text}
        </div>
      )}
      <button
        onClick={save}
        disabled={busy}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: '#004B9B' }}
      >
        {busy ? 'Đang lưu...' : 'Lưu'}
      </button>
    </div>
  );
}
