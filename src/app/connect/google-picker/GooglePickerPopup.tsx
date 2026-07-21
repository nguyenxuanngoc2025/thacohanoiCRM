'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// gapi / google.picker là SDK ngoài không có type → buộc dùng any.
import { useEffect, useState, useCallback } from 'react';

declare global { interface Window { gapi?: any; google?: any; } }

const GSI_SRC = 'https://apis.google.com/js/api.js';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error('load fail'));
    document.head.appendChild(s);
  });
}

// origin được phép nhận kết quả: apex hoặc *.crmthacoauto.com hoặc tên miền riêng (https).
// opener tự kiểm event.origin === apex nên đây chỉ là lớp lọc đích gửi (dữ liệu = id file, không nhạy cảm).
function safeReturnOrigin(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    return u.origin;
  } catch { return null; }
}

export default function GooglePickerPopup({ clientId, apiKey }: { clientId: string; apiKey: string }) {
  const [msg, setMsg] = useState('Đang mở cửa sổ chọn Google Sheet…');

  const returnOrigin = typeof window !== 'undefined'
    ? safeReturnOrigin(new URLSearchParams(window.location.search).get('return'))
    : null;

  const post = useCallback((payload: any) => {
    if (window.opener && returnOrigin) window.opener.postMessage(payload, returnOrigin);
  }, [returnOrigin]);

  const buildPicker = useCallback((accessToken: string) => {
    const projectNumber = clientId.split('-')[0];
    const view = new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS).setMode(window.google.picker.DocsViewMode.LIST);
    const picker = new window.google.picker.PickerBuilder()
      .addView(view).setOAuthToken(accessToken).setDeveloperKey(apiKey).setAppId(projectNumber)
      .setCallback((d: any) => {
        if (d.action === window.google.picker.Action.PICKED) {
          const doc = d.docs[0];
          post({ type: 'gsheet-picked', id: doc.id, name: doc.name });
          setMsg('Đã chọn file. Cửa sổ sẽ tự đóng…');
          window.close();
        }
        if (d.action === window.google.picker.Action.CANCEL) setMsg('Đã huỷ. Có thể đóng cửa sổ này.');
      }).build();
    picker.setVisible(true);
  }, [clientId, apiKey, post]);

  const gisFallback = useCallback(() => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp: { access_token?: string }) => {
        if (!resp.access_token) { setMsg('Bạn chưa cấp quyền. Có thể đóng cửa sổ này.'); return; }
        buildPicker(resp.access_token);
      },
    });
    tokenClient.requestAccessToken({ prompt: '' });
  }, [clientId, buildPicker]);

  const run = useCallback(async () => {
    if (!clientId || !apiKey) { setMsg('Nền tảng chưa cấu hình Google Client ID / API Key.'); return; }
    if (!returnOrigin) { setMsg('Thiếu địa chỉ quay lại hợp lệ.'); return; }
    try {
      await Promise.all([loadScript(GSI_SRC), loadScript(GIS_SRC)]);
      await new Promise<void>((res) => window.gapi.load('picker', () => res()));

      let handled = false;
      const onTok = (e: MessageEvent) => {
        if (e.origin !== returnOrigin) return;
        const d = e.data as { type?: string; token?: string };
        if (d?.type !== 'picker-token') return;
        window.removeEventListener('message', onTok);
        handled = true;
        if (d.token) buildPicker(d.token); else gisFallback();
      };
      window.addEventListener('message', onTok);
      post({ type: 'picker-ready' });                 // xin token từ opener (server-minted)
      setTimeout(() => { if (!handled) { window.removeEventListener('message', onTok); gisFallback(); } }, 4000);
    } catch { setMsg('Không mở được cửa sổ chọn sheet.'); }
  }, [clientId, apiKey, returnOrigin, post, buildPicker, gisFallback]);

  useEffect(() => { void run(); }, [run]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, color: '#334155' }}>
      <p style={{ fontSize: 14 }}>{msg}</p>
      <button onClick={() => void run()}
        style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, background: '#0F9D58', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
        Mở lại cửa sổ chọn
      </button>
    </div>
  );
}
