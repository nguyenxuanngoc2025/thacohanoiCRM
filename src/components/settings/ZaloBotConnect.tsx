'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { PrimaryBtn, GhostBtn } from './ui';

type Session = { status: 'connected' | 'disconnected'; displayName: string | null; lastError: string | null };

export default function ZaloBotConnect({ session }: { session: Session }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const connected = session.status === 'connected';

  const logout = async () => {
    if (!window.confirm('Ngắt kết nối con bot Zalo? Các thông báo sẽ ngừng gửi cho đến khi đăng nhập lại.')) return;
    await fetch('/api/integrations/zalo-bot/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    router.refresh();
  };

  return (
    <div className="rounded-lg border bg-white px-4 py-3" style={{ borderColor: connected ? '#10b98133' : '#e2e8f0' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
            Con bot gửi thông báo
            {connected
              ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700"><CheckCircle2 size={13} /> Đã kết nối{session.displayName ? ` — ${session.displayName}` : ''}</span>
              : <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500"><AlertTriangle size={13} /> Chưa kết nối</span>}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {connected
              ? 'Tài khoản Zalo này gửi tin lead/báo cáo vào các group bên dưới.'
              : 'Đăng nhập 1 tài khoản Zalo để hệ thống gửi thông báo vào group.'}
            {session.lastError && <span className="text-rose-500"> · {session.lastError}</span>}
          </div>
        </div>
        <div className="shrink-0">
          {connected
            ? <GhostBtn onClick={logout}>Ngắt kết nối</GhostBtn>
            : <PrimaryBtn onClick={() => setOpen(true)}><QrCode size={14} /> Đăng nhập Zalo</PrimaryBtn>}
        </div>
      </div>
      {open && <ZaloQrModal onClose={() => setOpen(false)} onConnected={() => { setOpen(false); router.refresh(); }} />}
    </div>
  );
}

function ZaloQrModal({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'pending' | 'connected' | 'error'>('loading');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = async () => {
    setStatus('loading'); setErr(null); setQr(null);
    const res = await fetch('/api/integrations/zalo-bot/login/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.qr) { setStatus('error'); setErr(data.error ?? 'Không tạo được mã QR.'); return; }
    setQr(data.qr); setStatus('pending');
  };

  useEffect(() => {
    start();
    pollRef.current = setInterval(async () => {
      const res = await fetch('/api/integrations/zalo-bot/login/status');
      const data = await res.json().catch(() => ({}));
      if (data.status === 'connected') { setStatus('connected'); setTimeout(onConnected, 800); }
      else if (data.status === 'error') { setStatus('error'); setErr(data.error ?? 'Đăng nhập lỗi.'); }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if ((status === 'connected' || status === 'error') && pollRef.current) clearInterval(pollRef.current);
  }, [status]);

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">Đăng nhập Zalo</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-6 flex flex-col items-center text-center">
          <p className="text-sm text-slate-500 mb-4">Mở <b>Zalo</b> trên điện thoại → <b>Cài đặt → Mã QR → Quét mã</b></p>
          <div className="w-56 h-56 rounded-xl border-2 flex items-center justify-center" style={{ borderColor: '#0068FF22' }}>
            {status === 'loading' && <span className="text-sm text-slate-400">Đang tạo mã QR…</span>}
            {qr && status === 'pending' && <img src={qr} alt="Mã QR đăng nhập Zalo" className="w-52 h-52 object-contain" />}
            {status === 'connected' && <div className="text-emerald-600 flex flex-col items-center gap-2"><CheckCircle2 size={48} /><span className="text-sm font-medium">Đã kết nối!</span></div>}
            {status === 'error' && <div className="text-rose-500 flex flex-col items-center gap-2 px-4"><AlertTriangle size={40} /><span className="text-xs">{err}</span></div>}
          </div>
          {status === 'pending' && <p className="text-[11px] text-slate-400 mt-4">Mã QR có hiệu lực trong thời gian ngắn. Đang chờ quét…</p>}
          {status === 'error' && <div className="mt-4"><PrimaryBtn onClick={start}><QrCode size={14} /> Tạo lại mã QR</PrimaryBtn></div>}
        </div>
      </div>
    </div>
  );
}
