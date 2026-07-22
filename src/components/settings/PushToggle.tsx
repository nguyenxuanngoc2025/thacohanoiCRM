'use client';

import React, { useEffect, useState } from 'react';
import { Bell, BellRing, BellOff, Info } from 'lucide-react';
import { BRAND } from '@/lib/brand';

type State = 'loading' | 'unsupported' | 'denied' | 'off' | 'on' | 'working';

// Chuyển VAPID public key (base64url) → Uint8Array cho PushManager.subscribe.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushToggle() {
  const [state, setState] = useState<State>('loading');
  const [msg, setMsg] = useState<string | null>(null);

  const supported = () =>
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  useEffect(() => {
    if (!supported()) { setState('unsupported'); return; }
    (async () => {
      if (Notification.permission === 'denied') { setState('denied'); return; }
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState(sub ? 'on' : 'off');
    })();
  }, []);

  const enable = async () => {
    setState('working'); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState('denied'); return; }
      const reg = await navigator.serviceWorker.ready;
      const res = await fetch('/api/push/subscribe');
      const { publicKey } = await res.json();
      if (!publicKey) { setMsg('Máy chủ chưa cấu hình khoá thông báo.'); setState('off'); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setState('on');
    } catch {
      setMsg('Không bật được thông báo. Thử lại hoặc kiểm tra quyền trình duyệt.');
      setState('off');
    }
  };

  const disable = async () => {
    setState('working'); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
    } catch { setState('on'); }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: BRAND }}>
          <Bell size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-800">Thông báo trên ứng dụng</h2>
          <p className="text-xs text-slate-500">Nhận thông báo lead mới, quá hạn, báo cáo cuối ngày — kể cả khi app đang đóng.</p>
        </div>
      </div>

      <div className="mt-4">
        {state === 'loading' && <p className="text-sm text-slate-400">Đang kiểm tra…</p>}

        {state === 'unsupported' && (
          <Note>Trình duyệt/thiết bị này chưa hỗ trợ thông báo. Trên iPhone: cần cài app ra Màn hình chính (iOS 16.4+) rồi mở từ biểu tượng ứng dụng.</Note>
        )}

        {state === 'denied' && (
          <Note>Bạn đã từ chối quyền thông báo. Vào cài đặt trình duyệt/hệ thống, cho phép Thông báo cho trang này rồi tải lại.</Note>
        )}

        {(state === 'off' || state === 'working') && (
          <button onClick={enable} disabled={state === 'working'}
            className="inline-flex w-fit items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-45"
            style={{ background: BRAND }}>
            <BellRing size={16} /> {state === 'working' ? 'Đang xử lý…' : 'Bật thông báo'}
          </button>
        )}

        {state === 'on' && (
          <div className="flex flex-col gap-3">
            <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <BellRing size={16} /> Đã bật thông báo trên thiết bị này.
            </div>
            <button onClick={disable}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
              <BellOff size={15} /> Tắt trên thiết bị này
            </button>
          </div>
        )}

        {msg && <Note>{msg}</Note>}

        <Note>
          iPhone/iPad: phải <b>cài app ra Màn hình chính</b> (theo hướng dẫn phía dưới) và dùng <b>iOS 16.4 trở lên</b> mới nhận được thông báo. Mở bằng Safari thường sẽ không reo.
        </Note>
      </div>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500 leading-relaxed">
      <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
      <span className="flex-1">{children}</span>
    </div>
  );
}
