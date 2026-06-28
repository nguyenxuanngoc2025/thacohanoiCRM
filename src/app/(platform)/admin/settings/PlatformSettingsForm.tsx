'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PlatformSettingsForm({ fbBusinessId }: { fbBusinessId: string }) {
  const router = useRouter();
  const [value, setValue] = useState(fbBusinessId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/platform/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'fb_business_id', value: value.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: json?.error ?? 'Lưu thất bại.' });
      return;
    }
    setMsg({ ok: true, text: 'Đã lưu. Mã sẽ hiển thị trong hướng dẫn kết nối Facebook của các công ty.' });
    router.refresh();
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 max-w-xl space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Mã doanh nghiệp Facebook (Business ID)</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Mã Business Manager của nền tảng. Các công ty sẽ cấp quyền fanpage cho mã này để CRM nhận
          lead. Lấy trong Cài đặt doanh nghiệp Facebook → Thông tin doanh nghiệp. Đổi mã thì dán lại
          rồi Lưu.
        </p>
      </div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ví dụ: 1234567890123456"
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
