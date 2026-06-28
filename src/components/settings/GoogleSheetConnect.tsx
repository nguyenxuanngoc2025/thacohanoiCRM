'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// gapi / google.picker là SDK ngoài không có type → buộc dùng any cho cửa sổ chọn file.
import React, { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import type { ShowroomRow, BrandRow, ChannelRow } from './types';

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

interface PreviewData { headers: string[]; sample: string[][]; guess: { phoneCol: number | null; nameCol: number | null } }

export default function GoogleSheetConnect({
  connected, clientId, apiKey, showrooms, brands, sheets,
}: {
  connected: boolean; clientId: string; apiKey: string;
  showrooms: ShowroomRow[]; brands: BrandRow[]; sheets: ChannelRow[];
}) {
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewTab, setPreviewTab] = useState<string | null>(null);
  const [phoneCol, setPhoneCol] = useState<number | null>(null);
  const [nameCol, setNameCol] = useState<number | null>(null);
  const [brandId, setBrandId] = useState('');
  const [srIds, setSrIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const runPreview = async (spreadsheetId: string, tab: string) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/integrations/google/preview?spreadsheetId=${encodeURIComponent(spreadsheetId)}&tab=${encodeURIComponent(tab)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Lỗi đọc sheet');
      setPreview(json);
      setPreviewTab(tab);
      setPhoneCol(json.guess.phoneCol);
      setNameCol(json.guess.nameCol);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Lỗi'); } finally { setBusy(false); }
  };

  // Sau khi chọn file → liệt kê các tab (sheet con) để người dùng tick chọn.
  const loadTabs = async (spreadsheetId: string) => {
    setBusy(true); setMsg(null);
    setTabs([]); setSelectedTabs([]); setPreview(null); setPreviewTab(null);
    try {
      const res = await fetch(`/api/integrations/google/tabs?spreadsheetId=${encodeURIComponent(spreadsheetId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Lỗi đọc danh sách tab');
      const list: string[] = json.tabs ?? [];
      setTabs(list);
      if (list.length === 1) { // file chỉ có 1 tab → chọn sẵn + xem trước cột luôn
        setSelectedTabs(list);
        void runPreview(spreadsheetId, list[0]);
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Lỗi'); } finally { setBusy(false); }
  };

  const toggleTab = (tab: string) => {
    if (!picked) return;
    const next = selectedTabs.includes(tab)
      ? selectedTabs.filter((t) => t !== tab)
      : [...selectedTabs, tab];
    setSelectedTabs(next);
    // Cấu hình cột đọc từ tab đầu tiên đã chọn — mọi tab dùng chung cấu hình.
    if (next.length === 0) { setPreview(null); setPreviewTab(null); }
    else if (next[0] !== previewTab) void runPreview(picked.id, next[0]);
  };

  const openPicker = useCallback(async () => {
    if (!clientId || !apiKey) { setMsg('Nền tảng chưa cấu hình Google Client ID / API Key.'); return; }
    setMsg(null); setPicking(true);
    // Mã project Google = phần trước dấu '-' của Client ID. Cần cho setAppId để
    // file chọn qua Picker được liên kết với APP → server (refresh token) đọc được.
    const projectNumber = clientId.split('-')[0];
    try {
      await Promise.all([loadScript(GSI_SRC), loadScript(GIS_SRC)]);
      await new Promise<void>((res) => window.gapi.load('picker', () => res()));
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (resp: { access_token?: string }) => {
          if (!resp.access_token) { setPicking(false); return; }
          const view = new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS).setMode(window.google.picker.DocsViewMode.LIST);
          const picker = new window.google.picker.PickerBuilder()
            .addView(view).setOAuthToken(resp.access_token).setDeveloperKey(apiKey).setAppId(projectNumber)
            .setCallback((d: any) => {
              if (d.action === window.google.picker.Action.PICKED) {
                const doc = d.docs[0];
                setPicked({ id: doc.id, name: doc.name });
                void loadTabs(doc.id);
              }
              if (d.action !== window.google.picker.Action.LOADED) setPicking(false);
            }).build();
          picker.setVisible(true);
        },
      });
      tokenClient.requestAccessToken({ prompt: '' });
    } catch { setMsg('Không mở được cửa sổ chọn sheet.'); setPicking(false); }
  }, [clientId, apiKey]);

  const save = async () => {
    if (!picked || phoneCol == null) { setMsg('Chọn cột Số điện thoại.'); return; }
    if (selectedTabs.length === 0) { setMsg('Chọn ít nhất 1 tab.'); return; }
    if (!brandId) { setMsg('Chọn thương hiệu.'); return; }
    if (srIds.length === 0) { setMsg('Chọn ít nhất 1 showroom.'); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/google-sheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'create', spreadsheet_id: picked.id, page_name: picked.name,
          brand_id: brandId, showroom_ids: srIds,
          tabs: selectedTabs,
          phone_col: phoneCol, name_col: nameCol, note_cols: [],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Lỗi lưu');
      window.location.reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Lỗi'); setBusy(false); }
  };

  if (!connected) {
    return (
      <div className="space-y-2">
        <a href="/api/integrations/google/start"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: '#0F9D58' }}>
          Kết nối Google
        </a>
        {msg && <p className="text-xs text-red-600">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button onClick={openPicker} disabled={picking || busy}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#0F9D58' }}>
        <Plus size={14} /> Thêm sheet
      </button>

      {picked && tabs.length > 0 && (
        <div className="rounded-xl border border-slate-200 p-4 space-y-2 bg-slate-50">
          <div className="text-sm font-semibold text-slate-800">Chọn tab cần lấy lead — {picked.name}</div>
          <p className="text-xs text-slate-500">File có {tabs.length} tab. Tick các tab muốn lấy lead (có thể chọn nhiều). Các tab dùng chung thương hiệu, showroom và cấu hình cột.</p>
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => {
              const on = selectedTabs.includes(t);
              return (
                <button key={t} type="button" onClick={() => toggleTab(t)} disabled={busy}
                  className={`rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 ${on ? 'border-[#004B9B] bg-[#004B9B] text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {preview && picked && selectedTabs.length > 0 && (
        <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50">
          <div className="text-sm font-semibold text-slate-800">Xác nhận cột — {picked.name}</div>
          <p className="text-xs text-slate-500">Đọc cấu hình cột từ tab “{previewTab}”. Áp dụng cho tất cả {selectedTabs.length} tab đã chọn.</p>
          <div className="grid grid-cols-2 gap-3">
            <ColSelect label="Cột Số điện thoại" headers={preview.headers} value={phoneCol} onChange={setPhoneCol} />
            <ColSelect label="Cột Họ tên" headers={preview.headers} value={nameCol} onChange={setNameCol} allowNone />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Thương hiệu</label>
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                <option value="">— chọn —</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Showroom nhận lead</label>
              <select multiple value={srIds} onChange={(e) => setSrIds(Array.from(e.target.selectedOptions, (o) => o.value))}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm h-20">
                {showrooms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={save} disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#004B9B' }}>Lưu sheet</button>
        </div>
      )}

      {sheets.length > 0 && (
        <ul className="text-sm text-slate-600 space-y-1">
          {sheets.map((s) => <li key={s.id} className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#0F9D58]" />{s.page_name ?? s.page_id}</li>)}
        </ul>
      )}
      {msg && <p className="text-xs text-red-600">{msg}</p>}
    </div>
  );
}

function ColSelect({ label, headers, value, onChange, allowNone }: {
  label: string; headers: string[]; value: number | null; onChange: (v: number | null) => void; allowNone?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <select value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
        {allowNone && <option value="">— không có —</option>}
        {!allowNone && <option value="">— chọn —</option>}
        {headers.map((h, i) => <option key={i} value={i}>{h || `Cột ${i + 1}`}</option>)}
      </select>
    </div>
  );
}
