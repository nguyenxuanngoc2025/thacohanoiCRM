'use client';
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, BarChart3, Eye, RefreshCw } from 'lucide-react';
import type { ShowroomRow, BrandRow, ChannelRow, ModelRow } from './types';
import { STATUS_LABEL } from '@/lib/lead-status';

// Cửa sổ chọn Google Sheet (Picker) chạy ở apex trung tâm — origin đã khai Google 1 lần.
// Mở popup tới đây, nhận id file qua postMessage. Thêm công ty mới không cần đụng Google Console.
const PLATFORM_ORIGIN = `https://${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'crmthacoauto.com'}`;

// Nguồn data THẬT gán cho từng tab (chế độ "Gán theo tab"). value = source lưu DB.
// KHÔNG có Google Sheet ở đây — sheet chỉ là kênh trung chuyển, lead vẫn từ FB/Google/TikTok…
const DEFAULT_SHEET_SOURCE = 'facebook';
const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'zalo', label: 'Zalo' },
  { value: 'google', label: 'Google Ads' },
  { value: 'website', label: 'Website' },
  { value: 'tiktok', label: 'TikTok' },
];
const sourceLabel = (v: string) => SOURCE_OPTIONS.find((o) => o.value === v)?.label ?? v;

type SourceMode = 'fixed' | 'column';
type ModelMode = 'auto' | 'fixed' | 'column';

interface PreviewData { headers: string[]; sample: string[][]; guess: { phoneCol: number | null; nameCol: number | null } }

interface LastSync { at: string; rows: number; fresh: number; dup: number; errors: string[] }
interface StatsData {
  page_name: string | null;
  total: number;
  byStatus: Record<string, number>;
  byShowroom: Record<string, number>;
  modelCovered: number;
  modelUncovered: number;
  lastLeadAt: string | null;
  lastSync: LastSync | null;
  warnings: string[];
}

const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export default function GoogleSheetConnect({
  connected, showrooms, brands, models, sheets,
}: {
  connected: boolean;
  showrooms: ShowroomRow[]; brands: BrandRow[]; models: ModelRow[]; sheets: ChannelRow[];
}) {
  const [picking, setPicking] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = thêm mới; có id = đang sửa
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [label, setLabel] = useState(''); // tên/nhãn hiển thị do người dùng đặt (mặc định = tên file)
  const [tabs, setTabs] = useState<string[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewTab, setPreviewTab] = useState<string | null>(null);
  const [phoneCol, setPhoneCol] = useState<number | null>(null);
  const [nameCol, setNameCol] = useState<number | null>(null);
  const [brandId, setBrandId] = useState('');
  const [srIds, setSrIds] = useState<string[]>([]);
  // Nguồn lead
  const [sourceMode, setSourceMode] = useState<SourceMode>('fixed');
  const [tabSources, setTabSources] = useState<Record<string, string>>({});
  const [sourceCol, setSourceCol] = useState<number | null>(null);
  // Dòng xe
  const [modelMode, setModelMode] = useState<ModelMode>('auto');
  const [modelId, setModelId] = useState('');
  const [modelCol, setModelCol] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false); // popup demo xác nhận trước khi lưu
  // Modal số liệu hệ thống của 1 sheet đã kết nối.
  const [statsId, setStatsId] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsBusy, setStatsBusy] = useState(false);
  const [statsMsg, setStatsMsg] = useState<string | null>(null);

  // Dòng xe lọc theo thương hiệu đã chọn (dropdown dòng xe phụ thuộc brand).
  const brandModels = useMemo(
    () => models.filter((m) => m.brand_id === brandId && m.is_active),
    [models, brandId],
  );

  const resetForm = () => {
    setEditingId(null); setPicked(null); setLabel(''); setTabs([]); setSelectedTabs([]);
    setPreview(null); setPreviewTab(null); setPhoneCol(null); setNameCol(null);
    setBrandId(''); setSrIds([]); setSourceMode('fixed'); setTabSources({});
    setSourceCol(null); setModelMode('auto'); setModelId(''); setModelCol(null);
    setConfirmOpen(false); setMsg(null);
  };

  const runPreview = async (spreadsheetId: string, tab: string, applyGuess = true) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/integrations/google/preview?spreadsheetId=${encodeURIComponent(spreadsheetId)}&tab=${encodeURIComponent(tab)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Lỗi đọc sheet');
      setPreview(json);
      setPreviewTab(tab);
      if (applyGuess) { setPhoneCol(json.guess.phoneCol); setNameCol(json.guess.nameCol); }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Lỗi'); } finally { setBusy(false); }
  };

  const fetchTabList = async (spreadsheetId: string): Promise<string[]> => {
    const res = await fetch(`/api/integrations/google/tabs?spreadsheetId=${encodeURIComponent(spreadsheetId)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Lỗi đọc danh sách tab');
    return json.tabs ?? [];
  };

  // Sau khi chọn file mới → liệt kê tab để tick chọn.
  const loadTabs = async (spreadsheetId: string) => {
    setBusy(true); setMsg(null);
    setTabs([]); setSelectedTabs([]); setPreview(null); setPreviewTab(null); setTabSources({});
    try {
      const list = await fetchTabList(spreadsheetId);
      setTabs(list);
      if (list.length === 1) { setSelectedTabs(list); void runPreview(spreadsheetId, list[0]); }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Lỗi'); } finally { setBusy(false); }
  };

  // Mở lại cấu hình sheet đã kết nối để chỉnh sửa — điền sẵn từ config + showroom đã lưu.
  const startEdit = async (sheet: ChannelRow) => {
    const cfg = sheet.config ?? {};
    const cfgTabs = (cfg.tabs ?? (cfg.tab ? [{ title: cfg.tab, source: null }] : [])) as { title: string; source?: string | null }[];
    const titles = cfgTabs.map((t) => t.title);
    setEditingId(sheet.id);
    setPicked({ id: sheet.page_id ?? '', name: sheet.page_name ?? sheet.page_id ?? '' });
    setLabel(sheet.page_name ?? sheet.page_id ?? '');
    setSelectedTabs(titles);
    setTabSources(Object.fromEntries(cfgTabs.map((t) => [t.title, t.source ?? DEFAULT_SHEET_SOURCE])));
    setPhoneCol(cfg.phone_col ?? null);
    setNameCol(cfg.name_col ?? null);
    setSourceMode(cfg.source_mode === 'column' ? 'column' : 'fixed');
    setSourceCol(cfg.source_col ?? null);
    setModelMode(cfg.model_mode === 'fixed' ? 'fixed' : cfg.model_mode === 'column' ? 'column' : 'auto');
    setModelId(cfg.model_id ?? '');
    setModelCol(cfg.model_col ?? null);
    setBrandId(sheet.brand_id ?? '');
    setSrIds(sheet.showroom_ids ?? []);
    setMsg(null); setBusy(true);
    try {
      const list = await fetchTabList(sheet.page_id ?? '');
      setTabs(list);
      const firstTab = titles[0] ?? list[0] ?? '';
      if (firstTab) await runPreview(sheet.page_id ?? '', firstTab, false); // giữ cột đã lưu
      else setBusy(false);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Lỗi'); setBusy(false); }
  };

  const del = async (sheet: ChannelRow) => {
    if (!window.confirm(`Xoá kết nối sheet "${sheet.page_name ?? sheet.page_id}"? Lead cũ vẫn giữ, lead mới từ sheet này sẽ ngừng vào.`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/google-sheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'delete', id: sheet.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Lỗi xoá');
      window.location.reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Lỗi'); setBusy(false); }
  };

  // Mở modal số liệu + tải thống kê của sheet.
  const openStats = async (id: string) => {
    setStatsId(id); setStats(null); setStatsMsg(null); setStatsBusy(true);
    try {
      const res = await fetch(`/api/admin/google-sheets/stats?id=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Lỗi tải số liệu');
      setStats(json);
    } catch (e) { setStatsMsg(e instanceof Error ? e.message : 'Lỗi'); } finally { setStatsBusy(false); }
  };

  // Đồng bộ ngay 1 sheet (thay vì chờ cron 5 phút) rồi tải lại số liệu.
  const syncNow = async () => {
    if (!statsId) return;
    setStatsBusy(true); setStatsMsg(null);
    try {
      const res = await fetch('/api/admin/google-sheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'sync', id: statsId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Lỗi đồng bộ');
      const r2 = await fetch(`/api/admin/google-sheets/stats?id=${encodeURIComponent(statsId)}`);
      const j2 = await r2.json();
      if (r2.ok) setStats(j2);
    } catch (e) { setStatsMsg(e instanceof Error ? e.message : 'Lỗi'); } finally { setStatsBusy(false); }
  };

  // Xem demo 1 sheet đã kết nối: nạp lại cấu hình rồi mở popup map cột.
  const showDemo = async (sheet: ChannelRow) => {
    await startEdit(sheet);
    setConfirmOpen(true);
  };

  const toggleTab = (tab: string) => {
    if (!picked) return;
    const next = selectedTabs.includes(tab)
      ? selectedTabs.filter((t) => t !== tab)
      : [...selectedTabs, tab];
    setSelectedTabs(next);
    if (next.length === 0) { setPreview(null); setPreviewTab(null); }
    else if (next[0] !== previewTab) void runPreview(picked.id, next[0], !editingId);
  };

  const toggleShowroom = (id: string) => {
    setSrIds((cur) => cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]);
  };

  // Mở cửa sổ chọn Google Sheet ở apex trung tâm (origin đã khai Google 1 lần). Popup tự
  // xin quyền + Picker rồi gửi id file về qua postMessage (listener bên dưới nhận).
  const openPicker = useCallback(() => {
    setMsg(null);
    const url = `${PLATFORM_ORIGIN}/connect/google-picker?return=${encodeURIComponent(window.location.origin)}`;
    const win = window.open(url, 'gsheet-picker', 'width=900,height=650');
    if (!win) { setMsg('Trình duyệt chặn cửa sổ bật lên. Hãy cho phép pop-up rồi thử lại.'); return; }
    setPicking(true);
  }, []);

  // Nhận id file từ popup apex. Chỉ tin message đúng origin apex + đúng loại.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== PLATFORM_ORIGIN) return;
      const d = e.data as { type?: string; id?: string; name?: string };
      if (d?.type !== 'gsheet-picked' || !d.id) return;
      setPicking(false);
      setEditingId(null);
      setPicked({ id: d.id, name: d.name ?? d.id });
      setLabel(d.name ?? d.id);
      setBrandId(''); setSrIds([]); setSourceMode('fixed'); setTabSources({});
      setSourceCol(null); setModelMode('auto'); setModelId(''); setModelCol(null);
      void loadTabs(d.id);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Kiểm tra hợp lệ rồi mở popup demo xác nhận (không lưu ngay — để soi map cột trước).
  const requestSave = () => {
    if (!picked || phoneCol == null) { setMsg('Chọn cột Số điện thoại.'); return; }
    if (selectedTabs.length === 0) { setMsg('Chọn ít nhất 1 tab.'); return; }
    if (!brandId) { setMsg('Chọn thương hiệu.'); return; }
    if (srIds.length === 0) { setMsg('Chọn ít nhất 1 showroom.'); return; }
    if (sourceMode === 'column' && sourceCol == null) { setMsg('Chọn cột Nguồn.'); return; }
    if (modelMode === 'fixed' && !modelId) { setMsg('Chọn dòng xe.'); return; }
    if (modelMode === 'column' && modelCol == null) { setMsg('Chọn cột Dòng xe.'); return; }
    setMsg(null); setConfirmOpen(true);
  };

  const doSave = async () => {
    if (!picked || phoneCol == null) return;
    setBusy(true); setMsg(null);
    try {
      const tabsPayload = selectedTabs.map((t) => ({
        title: t,
        source: sourceMode === 'fixed' ? (tabSources[t] || DEFAULT_SHEET_SOURCE) : null,
      }));
      const res = await fetch('/api/admin/google-sheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: editingId ? 'update' : 'create',
          id: editingId ?? undefined,
          spreadsheet_id: picked.id, page_name: label.trim() || picked.name,
          brand_id: brandId, showroom_ids: srIds,
          tabs: tabsPayload,
          source_mode: sourceMode,
          source_col: sourceMode === 'column' ? sourceCol : null,
          model_mode: modelMode,
          model_id: modelMode === 'fixed' ? modelId : null,
          model_col: modelMode === 'column' ? modelCol : null,
          phone_col: phoneCol, name_col: nameCol, note_cols: [],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Lỗi lưu');
      window.location.reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Lỗi'); setBusy(false); setConfirmOpen(false); }
  };

  // Một dòng dữ liệu mẫu → map vào các trường CRM (để demo kết nối đúng/sai).
  const mapRow = (r: string[]) => {
    const phone = phoneCol != null ? (r[phoneCol] ?? '') : '';
    const name = nameCol != null ? (r[nameCol] ?? '') : '';
    const source = sourceMode === 'column'
      ? (sourceCol != null ? (r[sourceCol] ?? '') : '')
      : sourceLabel(tabSources[previewTab ?? ''] || DEFAULT_SHEET_SOURCE);
    let model = '(tự nhận diện)';
    if (modelMode === 'fixed') model = brandModels.find((m) => m.id === modelId)?.name ?? '—';
    else if (modelMode === 'column') model = modelCol != null ? (r[modelCol] ?? '') : '';
    return { phone, name, source, model };
  };
  const demoRows = (preview?.sample ?? []).slice(0, 3).map(mapRow).filter((d) => d.phone || d.name);

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
      <div className="flex items-center gap-2">
        <button onClick={openPicker} disabled={picking || busy}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#0F9D58' }}>
          <Plus size={14} /> Thêm sheet
        </button>
        {(picked || editingId) && (
          <button onClick={resetForm} disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
            <X size={14} /> Huỷ
          </button>
        )}
      </div>

      {picked && tabs.length > 0 && (
        <div className="rounded-xl border border-slate-200 p-4 space-y-2 bg-slate-50">
          <div className="text-sm font-semibold text-slate-800">
            {editingId ? 'Sửa kết nối' : 'Chọn tab cần lấy lead'} — {picked.name}
          </div>
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
        <div className="rounded-xl border border-slate-200 p-4 space-y-4 bg-slate-50">
          <div>
            <div className="text-sm font-semibold text-slate-800">Cấu hình nạp lead — {picked.name}</div>
            <p className="text-xs text-slate-500 mt-0.5">Đọc cấu hình cột từ tab “{previewTab}”. Áp dụng cho tất cả {selectedTabs.length} tab đã chọn.</p>
          </div>

          {/* 0. Tên/nhãn hiển thị */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tên hiển thị</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder={picked.name}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
            <p className="text-[11px] text-slate-400 mt-1">Đặt tên dễ nhớ cho kết nối này (vd “Lead Tải Bus HN”). Để trống = tên file Google.</p>
          </div>

          {/* 1. Cột dữ liệu */}
          <div className="grid grid-cols-2 gap-3">
            <ColSelect label="Cột Số điện thoại" headers={preview.headers} value={phoneCol} onChange={setPhoneCol} />
            <ColSelect label="Cột Họ tên" headers={preview.headers} value={nameCol} onChange={setNameCol} allowNone />
          </div>

          {/* 2. Thương hiệu */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Thương hiệu</label>
            <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setModelId(''); }}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
              <option value="">— chọn —</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* 3. Nguồn lead */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600">Nguồn lead</label>
            <Segmented value={sourceMode} onChange={(v) => setSourceMode(v as SourceMode)}
              options={[{ value: 'fixed', label: 'Gán theo tab' }, { value: 'column', label: 'Lấy theo cột' }]} />
            {sourceMode === 'fixed' ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-400">Chọn nguồn data thật cho từng tab (Google Sheet chỉ là kênh trung chuyển). Mặc định = Facebook.</p>
                {selectedTabs.map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <span className="text-xs text-slate-600 w-32 shrink-0 truncate" title={t}>{t}</span>
                    <select value={tabSources[t] ?? DEFAULT_SHEET_SOURCE}
                      onChange={(e) => setTabSources((cur) => ({ ...cur, [t]: e.target.value }))}
                      className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white">
                      {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            ) : (
              <ColSelect label="Cột chứa Nguồn" headers={preview.headers} value={sourceCol} onChange={setSourceCol} />
            )}
          </div>

          {/* 4. Dòng xe */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600">Dòng xe</label>
            <Segmented value={modelMode} onChange={(v) => setModelMode(v as ModelMode)}
              options={[
                { value: 'auto', label: 'Tự nhận diện' },
                { value: 'fixed', label: '1 dòng cố định' },
                { value: 'column', label: 'Lấy theo cột' },
              ]} />
            {modelMode === 'auto' && (
              <p className="text-[11px] text-slate-400">Hệ thống tự dò dòng xe theo từ khoá (tên + ghi chú), chỉ điền khi trúng đúng 1 dòng.</p>
            )}
            {modelMode === 'fixed' && (
              <div>
                {!brandId
                  ? <p className="text-[11px] text-amber-600">Chọn thương hiệu trước để chọn dòng xe.</p>
                  : (
                    <select value={modelId} onChange={(e) => setModelId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white">
                      <option value="">— chọn dòng xe —</option>
                      {brandModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}
              </div>
            )}
            {modelMode === 'column' && (
              <ColSelect label="Cột chứa Dòng xe" headers={preview.headers} value={modelCol} onChange={setModelCol} />
            )}
          </div>

          {/* 5. Showroom nhận lead */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600">Showroom nhận lead</label>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {showrooms.map((s) => {
                const checked = srIds.includes(s.id);
                return (
                  <label key={s.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors"
                    style={{ borderColor: checked ? '#004B9B' : '#e2e8f0', background: checked ? '#e6f0fa' : '#fff' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleShowroom(s.id)} className="accent-[#004B9B]" />
                    <span className="text-sm font-medium text-slate-700">{s.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <button onClick={requestSave} disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#004B9B' }}>
            {editingId ? 'Xem trước & cập nhật' : 'Xem trước & lưu'}
          </button>
        </div>
      )}

      {/* Danh sách sheet đã kết nối — sửa / xoá */}
      {sheets.length > 0 && (
        <ul className="space-y-1.5">
          {sheets.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-slate-700 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0F9D58] shrink-0" />
                <span className="truncate">{s.page_name ?? s.page_id}</span>
              </span>
              <span className="flex items-center gap-1 shrink-0">
                <button onClick={() => openStats(s.id)} disabled={busy}
                  className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2 py-1 border border-slate-200 hover:bg-slate-50 disabled:opacity-50" style={{ color: '#0F9D58' }}>
                  <BarChart3 size={12} /> Số liệu
                </button>
                <button onClick={() => showDemo(s)} disabled={busy}
                  className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2 py-1 border border-slate-200 hover:bg-slate-50 disabled:opacity-50" style={{ color: '#7c3aed' }}>
                  <Eye size={12} /> Xem demo
                </button>
                <button onClick={() => startEdit(s)} disabled={busy}
                  className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2 py-1 border border-slate-200 hover:bg-slate-50 disabled:opacity-50" style={{ color: '#004B9B' }}>
                  <Edit2 size={12} /> Sửa
                </button>
                <button onClick={() => del(s)} disabled={busy}
                  className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2 py-1 border border-slate-200 hover:bg-red-50 text-red-600 disabled:opacity-50">
                  <Trash2 size={12} /> Xoá
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="text-xs text-red-600">{msg}</p>}

      {/* Popup demo: dữ liệu thật của sheet map vào các trường CRM */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div>
                <div className="text-sm font-bold text-slate-900">Xem trước dữ liệu lấy về</div>
                <div className="text-xs text-slate-400 mt-0.5">Kiểm tra cột đã map đúng chưa trước khi lưu — dữ liệu mẫu từ tab “{previewTab}”.</div>
              </div>
              <button onClick={() => setConfirmOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="px-5 py-4">
              {demoRows.length === 0 ? (
                <p className="text-sm text-amber-600">Không có dòng dữ liệu mẫu để xem trước. Kiểm tra lại tab/cột đã chọn.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                        <th className="px-3 py-2">Số điện thoại</th>
                        <th className="px-3 py-2">Họ tên</th>
                        <th className="px-3 py-2">Nguồn</th>
                        <th className="px-3 py-2">Dòng xe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demoRows.map((d, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium text-slate-800">{d.phone || <span className="text-red-500">— trống —</span>}</td>
                          <td className="px-3 py-2 text-slate-700">{d.name || '—'}</td>
                          <td className="px-3 py-2 text-slate-700">{d.source || '—'}</td>
                          <td className="px-3 py-2 text-slate-700">{d.model || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-3">
                Tiêu đề là trường trong CRM, dữ liệu là của sheet bạn. Nếu sai cột, bấm “Quay lại sửa” và chọn lại cột.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button onClick={() => setConfirmOpen(false)} disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
                Quay lại sửa
              </button>
              <button onClick={doSave} disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#004B9B' }}>
                {busy ? 'Đang lưu…' : (editingId ? 'Xác nhận cập nhật' : 'Xác nhận & lưu')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal số liệu hệ thống của 1 sheet */}
      {statsId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setStatsId(null)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 sticky top-0 bg-white">
              <div>
                <div className="text-sm font-bold text-slate-900">Số liệu hệ thống{stats?.page_name ? ` — ${stats.page_name}` : ''}</div>
                <div className="text-xs text-slate-400 mt-0.5">Tự động quét lại 5 phút/lần. Trùng SĐT (theo thương hiệu) sẽ bị bỏ qua và ghi nhận.</div>
              </div>
              <button onClick={() => setStatsId(null)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {statsBusy && !stats ? (
                <p className="text-sm text-slate-500">Đang tải số liệu…</p>
              ) : !stats ? (
                <p className="text-sm text-red-600">{statsMsg ?? 'Không tải được số liệu.'}</p>
              ) : (
                <>
                  {/* Hàng số liệu chính */}
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Tổng lead đã lấy về" value={stats.total} hint="Toàn bộ lead còn trong CRM" />
                    <StatCard label="Lead mới (lần đồng bộ gần nhất)" value={stats.lastSync?.fresh ?? 0} hint="Dòng mới thực sự được thêm" />
                    <StatCard label="Trùng đã bỏ qua (gần nhất)" value={stats.lastSync?.dup ?? 0} hint="Dòng trùng SĐT, không thêm lại" />
                  </div>

                  {/* Lần đồng bộ gần nhất + Đồng bộ ngay */}
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-500">
                        {stats.lastSync ? (
                          <>Đồng bộ gần nhất: <span className="font-semibold text-slate-700">{fmtDateTime(stats.lastSync.at)}</span> · quét {stats.lastSync.rows} dòng có SĐT</>
                        ) : 'Chưa từng đồng bộ.'}
                        {stats.lastSync && stats.lastSync.errors.length > 0 && (
                          <span className="block text-red-600 mt-0.5">Lỗi: {stats.lastSync.errors.join(' · ')}</span>
                        )}
                      </div>
                      <button onClick={syncNow} disabled={statsBusy}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shrink-0 disabled:opacity-50" style={{ background: '#0F9D58' }}>
                        <RefreshCw size={13} className={statsBusy ? 'animate-spin' : ''} /> {statsBusy ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
                      </button>
                    </div>
                  </div>

                  {/* Nhận diện dòng xe */}
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs font-semibold text-slate-600 mb-1.5">Nhận diện dòng xe</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${stats.total ? Math.round((stats.modelCovered / stats.total) * 100) : 0}%`, background: '#0F9D58' }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 shrink-0">
                        {stats.modelCovered}/{stats.total} ({stats.total ? Math.round((stats.modelCovered / stats.total) * 100) : 0}%)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{stats.modelUncovered} lead chưa xác định được dòng xe.</p>
                  </div>

                  {/* Phân loại theo trạng thái */}
                  <DistRow title="Phân loại theo trạng thái" data={stats.byStatus} label={(k) => STATUS_LABEL[k as keyof typeof STATUS_LABEL] ?? k} />

                  {/* Chia về showroom */}
                  <DistRow title="Lead chia về showroom" data={stats.byShowroom} label={(k) => k} />

                  {/* Cảnh báo cấu hình */}
                  {stats.warnings.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                      <div className="text-xs font-semibold text-amber-800">Cảnh báo cấu hình</div>
                      {stats.warnings.map((w, i) => <p key={i} className="text-[11px] text-amber-700">• {w}</p>)}
                    </div>
                  )}

                  {statsMsg && <p className="text-xs text-red-600">{statsMsg}</p>}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Ô số liệu nổi bật trong modal thống kê.
function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="text-2xl font-bold text-slate-900">{value.toLocaleString('vi-VN')}</div>
      <div className="text-[11px] font-semibold text-slate-600 mt-0.5">{label}</div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

// Hàng phân bố (trạng thái / showroom) dạng danh sách nhãn + số đếm.
function DistRow({ title, data, label }: { title: string; data: Record<string, number>; label: (k: string) => string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="text-xs font-semibold text-slate-600 mb-1.5">{title}</div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-slate-400">Chưa có dữ liệu.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {entries.map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
              {label(k)} <span className="font-semibold text-slate-900">{v}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Segmented({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'bg-[#004B9B] text-white' : 'text-slate-600 hover:text-slate-900'}`}>
            {o.label}
          </button>
        );
      })}
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
