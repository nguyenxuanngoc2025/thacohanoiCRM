'use client';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, BarChart3, Eye, RefreshCw, Settings2, Check } from 'lucide-react';
import type { ShowroomRow, BrandRow, ChannelRow, ModelRow } from './types';
import { STATUS_LABEL } from '@/lib/lead-status';
import { useDialogs } from '@/components/ui/dialogs';

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

// Cấu hình ĐẦY ĐỦ của 1 tab — mỗi tab độc lập (thương hiệu/showroom/cột/nguồn/dòng xe/mốc thời gian).
interface TabForm {
  brandId: string; srIds: string[];
  phoneCol: number | null; nameCol: number | null;
  sourceMode: SourceMode; source: string; sourceCol: number | null;
  modelMode: ModelMode; modelId: string; modelCol: number | null;
  dateCol: number | null; since: string;
  addressCol: number | null; addressFallback: string;
}

interface LastSync { at: string; rows: number; fresh: number; dup: number; skipped?: number; errors: string[] }
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

// Ngày hôm nay dạng YYYY-MM-DD (giờ địa phương) — mặc định mốc "lấy lead từ ngày" khi kết nối mới.
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyTabForm = (): TabForm => ({
  brandId: '', srIds: [], phoneCol: null, nameCol: null,
  sourceMode: 'fixed', source: DEFAULT_SHEET_SOURCE, sourceCol: null,
  modelMode: 'auto', modelId: '', modelCol: null,
  dateCol: null, since: todayISO(),
  addressCol: null, addressFallback: '',
});

export default function GoogleSheetConnect({
  connected, showrooms, brands, models, sheets,
}: {
  connected: boolean;
  showrooms: ShowroomRow[]; brands: BrandRow[]; models: ModelRow[]; sheets: ChannelRow[];
}) {
  const { confirm, dialog } = useDialogs();
  const [picking, setPicking] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = thêm mới; có id = đang sửa
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [label, setLabel] = useState(''); // tên/nhãn hiển thị do người dùng đặt (mặc định = tên file)
  const [tabs, setTabs] = useState<string[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<string[]>([]);
  // Mỗi tab một cấu hình riêng + preview riêng. openTab = tab đang mở bảng cấu hình.
  const [tabForms, setTabForms] = useState<Record<string, TabForm>>({});
  const [openTab, setOpenTab] = useState<string | null>(null);
  const [previewByTab, setPreviewByTab] = useState<Record<string, PreviewData>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false); // popup demo xác nhận trước khi lưu
  // Modal số liệu hệ thống của 1 sheet đã kết nối.
  const [statsId, setStatsId] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsBusy, setStatsBusy] = useState(false);
  const [statsMsg, setStatsMsg] = useState<string | null>(null);
  const pickerWinRef = useRef<Window | null>(null);

  const setTabField = useCallback(<K extends keyof TabForm>(tab: string, key: K, val: TabForm[K]) => {
    setTabForms((cur) => ({ ...cur, [tab]: { ...(cur[tab] ?? emptyTabForm()), [key]: val } }));
  }, []);

  const resetForm = () => {
    setEditingId(null); setPicked(null); setLabel(''); setTabs([]); setSelectedTabs([]);
    setTabForms({}); setOpenTab(null); setPreviewByTab({});
    setConfirmOpen(false); setMsg(null);
  };

  const fetchTabList = async (spreadsheetId: string): Promise<string[]> => {
    const res = await fetch(`/api/integrations/google/tabs?spreadsheetId=${encodeURIComponent(spreadsheetId)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Lỗi đọc danh sách tab');
    return json.tabs ?? [];
  };

  // Đọc preview 1 tab (nếu applyGuess & tab chưa có cột SĐT → điền cột gợi ý).
  const runPreviewTab = async (spreadsheetId: string, tab: string, applyGuess: boolean) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/integrations/google/preview?spreadsheetId=${encodeURIComponent(spreadsheetId)}&tab=${encodeURIComponent(tab)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Lỗi đọc sheet');
      setPreviewByTab((cur) => ({ ...cur, [tab]: json }));
      if (applyGuess) {
        setTabForms((cur) => {
          const f = cur[tab] ?? emptyTabForm();
          if (f.phoneCol != null) return cur; // giữ cột đã có (cấu hình đã lưu / người dùng đã chọn)
          return { ...cur, [tab]: { ...f, phoneCol: json.guess.phoneCol, nameCol: json.guess.nameCol } };
        });
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Lỗi'); } finally { setBusy(false); }
  };

  // Nạp preview cho nhiều tab (dùng cho "Xem demo" — cần dữ liệu mẫu mọi tab).
  const loadPreviewsFor = async (spreadsheetId: string, titles: string[]) => {
    for (const t of titles) {
      try {
        const res = await fetch(`/api/integrations/google/preview?spreadsheetId=${encodeURIComponent(spreadsheetId)}&tab=${encodeURIComponent(t)}`);
        const json = await res.json();
        if (res.ok) setPreviewByTab((cur) => ({ ...cur, [t]: json }));
      } catch { /* bỏ qua tab lỗi */ }
    }
  };

  // Chọn file MỚI (chưa từng kết nối) → liệt kê tab, để trống cấu hình từng tab.
  const onPickNewFile = async (id: string, name: string) => {
    setEditingId(null);
    setPicked({ id, name });
    setLabel(name);
    setSelectedTabs([]); setTabForms({}); setOpenTab(null); setPreviewByTab({});
    setBusy(true); setMsg(null);
    try {
      const list = await fetchTabList(id);
      setTabs(list);
      if (list.length === 1) {
        setSelectedTabs(list);
        setTabForms({ [list[0]]: emptyTabForm() });
        setOpenTab(list[0]);
        await runPreviewTab(id, list[0], true);
      } else setBusy(false);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Lỗi'); setBusy(false); }
  };

  // Mở lại cấu hình sheet đã kết nối để chỉnh — dựng tabForms từ config đã lưu (kế thừa cấp-dòng cho cấu hình cũ).
  const startEdit = async (sheet: ChannelRow) => {
    const cfg = sheet.config ?? {};
    const rawTabs = (cfg.tabs && cfg.tabs.length > 0
      ? cfg.tabs.map((t) => (typeof t === 'string' ? { title: t } : t))
      : cfg.tab ? [{ title: cfg.tab }] : []) as unknown as Record<string, unknown>[];
    const titles = rawTabs.map((t) => String(t.title ?? ''));
    const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));
    const forms: Record<string, TabForm> = {};
    for (const t of rawTabs) {
      const title = String(t.title ?? '');
      const smode = (t.source_mode ?? cfg.source_mode) === 'column' ? 'column' : 'fixed';
      const mmodeRaw = (t.model_mode ?? cfg.model_mode) as string | undefined;
      const mmode: ModelMode = mmodeRaw === 'fixed' ? 'fixed' : mmodeRaw === 'column' ? 'column' : 'auto';
      forms[title] = {
        brandId: String((t.brand_id ?? cfg.brand_id ?? sheet.brand_id ?? '') || ''),
        srIds: (t.showroom_ids ?? cfg.showroom_ids ?? sheet.showroom_ids ?? []) as string[],
        phoneCol: num(t.phone_col ?? cfg.phone_col),
        nameCol: num(t.name_col ?? cfg.name_col),
        sourceMode: smode as SourceMode,
        source: String((t.source ?? DEFAULT_SHEET_SOURCE) || DEFAULT_SHEET_SOURCE),
        sourceCol: num(t.source_col ?? cfg.source_col),
        modelMode: mmode,
        modelId: String((t.model_id ?? cfg.model_id ?? '') || ''),
        modelCol: num(t.model_col ?? cfg.model_col),
        dateCol: num(t.date_col ?? cfg.date_col),
        since: String((t.since ?? cfg.since ?? '') || ''),
        addressCol: num(t.address_col ?? cfg.address_col),
        addressFallback: String((t.address_fallback_province ?? cfg.address_fallback_province ?? '') || ''),
      };
    }
    setEditingId(sheet.id);
    setPicked({ id: sheet.page_id ?? '', name: sheet.page_name ?? sheet.page_id ?? '' });
    setLabel(sheet.page_name ?? sheet.page_id ?? '');
    setSelectedTabs(titles);
    setTabForms(forms);
    setOpenTab(null);
    setPreviewByTab({});
    setMsg(null); setBusy(true);
    try {
      const list = await fetchTabList(sheet.page_id ?? '');
      setTabs(list);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Lỗi'); } finally { setBusy(false); }
  };

  const del = async (sheet: ChannelRow) => {
    if (!(await confirm({
      title: 'Xoá kết nối sheet',
      message: `Xoá kết nối sheet "${sheet.page_name ?? sheet.page_id}"? Lead cũ vẫn giữ, lead mới từ sheet này sẽ ngừng vào.`,
      danger: true, confirmText: 'Xoá',
    }))) return;
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

  // Xem demo 1 sheet đã kết nối: nạp lại cấu hình + preview mọi tab rồi mở popup map cột.
  const showDemo = async (sheet: ChannelRow) => {
    await startEdit(sheet);
    const cfg = sheet.config ?? {};
    const titles = (cfg.tabs && cfg.tabs.length > 0
      ? cfg.tabs.map((t) => (typeof t === 'string' ? t : t.title))
      : cfg.tab ? [cfg.tab] : []) as string[];
    await loadPreviewsFor(sheet.page_id ?? '', titles);
    setConfirmOpen(true);
  };

  // Tick / bỏ tick 1 tab (đưa vào / gỡ khỏi danh sách lấy lead).
  const toggleTab = (tab: string) => {
    if (!picked) return;
    const on = selectedTabs.includes(tab);
    if (on) {
      setSelectedTabs((c) => c.filter((t) => t !== tab));
      if (openTab === tab) setOpenTab(null);
    } else {
      setSelectedTabs((c) => [...c, tab]);
      setTabForms((tf) => (tf[tab] ? tf : { ...tf, [tab]: emptyTabForm() }));
    }
  };

  // Mở bảng cấu hình cho 1 tab đã chọn (tải preview nếu chưa có).
  const openConfigTab = (tab: string) => {
    if (!picked) return;
    setOpenTab(tab);
    if (!previewByTab[tab]) void runPreviewTab(picked.id, tab, true);
  };

  // Mở cửa sổ chọn Google Sheet ở apex trung tâm (origin đã khai Google 1 lần). Popup xin token
  // ngắn hạn qua handshake (không bắt đăng nhập lại) rồi gửi id file về qua postMessage.
  const openPicker = useCallback(() => {
    setMsg(null);
    const url = `${PLATFORM_ORIGIN}/connect/google-picker?return=${encodeURIComponent(window.location.origin)}`;
    const win = window.open(url, 'gsheet-picker', 'width=900,height=650');
    if (!win) { setMsg('Trình duyệt chặn cửa sổ bật lên. Hãy cho phép pop-up rồi thử lại.'); return; }
    pickerWinRef.current = win;
    setPicking(true);
  }, []);

  // Handshake với popup apex: (1) popup xin token → dùng phiên tenant đúc token ngắn hạn gửi lại
  // (không đăng nhập Google lại); (2) popup gửi id file đã chọn — file đã kết nối thì mở sửa, else thêm mới.
  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== PLATFORM_ORIGIN) return;
      const d = e.data as { type?: string; id?: string; name?: string };
      if (d?.type === 'picker-ready') {
        try {
          const res = await fetch('/api/integrations/google/picker-token');
          const json = await res.json();
          const token = res.ok ? (json.token as string) : '';
          pickerWinRef.current?.postMessage({ type: 'picker-token', token }, PLATFORM_ORIGIN);
        } catch {
          pickerWinRef.current?.postMessage({ type: 'picker-token', token: '' }, PLATFORM_ORIGIN);
        }
        return;
      }
      if (d?.type === 'gsheet-picked' && d.id) {
        setPicking(false);
        const existing = sheets.find((s) => s.page_id === d.id);
        if (existing) void startEdit(existing);
        else void onPickNewFile(d.id, d.name ?? d.id);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets]);

  // Kiểm tra hợp lệ từng tab rồi mở popup demo xác nhận (không lưu ngay — soi map cột trước).
  const requestSave = () => {
    if (!picked) { setMsg('Chưa chọn file.'); return; }
    if (selectedTabs.length === 0) { setMsg('Chọn ít nhất 1 tab.'); return; }
    for (const t of selectedTabs) {
      const f = tabForms[t];
      if (!f || f.phoneCol == null) { setMsg(`Tab "${t}": chọn cột Số điện thoại.`); return; }
      if (!f.brandId) { setMsg(`Tab "${t}": chọn thương hiệu.`); return; }
      if (f.srIds.length === 0) { setMsg(`Tab "${t}": chọn ít nhất 1 showroom.`); return; }
      if (f.sourceMode === 'column' && f.sourceCol == null) { setMsg(`Tab "${t}": chọn cột Nguồn.`); return; }
      if (f.modelMode === 'fixed' && !f.modelId) { setMsg(`Tab "${t}": chọn dòng xe.`); return; }
      if (f.modelMode === 'column' && f.modelCol == null) { setMsg(`Tab "${t}": chọn cột Dòng xe.`); return; }
    }
    setMsg(null); setConfirmOpen(true);
  };

  const doSave = async () => {
    if (!picked) return;
    setBusy(true); setMsg(null);
    try {
      const tabsPayload = selectedTabs.map((t) => {
        const f = tabForms[t] ?? emptyTabForm();
        return {
          title: t,
          brand_id: f.brandId,
          showroom_ids: f.srIds,
          phone_col: f.phoneCol,
          name_col: f.nameCol,
          note_cols: [],
          source_mode: f.sourceMode,
          source: f.sourceMode === 'fixed' ? (f.source || DEFAULT_SHEET_SOURCE) : null,
          source_col: f.sourceMode === 'column' ? f.sourceCol : null,
          model_mode: f.modelMode,
          model_id: f.modelMode === 'fixed' ? f.modelId : null,
          model_col: f.modelMode === 'column' ? f.modelCol : null,
          date_col: f.dateCol,
          since: f.since || null,
          address_col: f.addressCol,
          address_fallback_province: f.addressCol != null ? (f.addressFallback || null) : null,
        };
      });
      const res = await fetch('/api/admin/google-sheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: editingId ? 'update' : 'create',
          id: editingId ?? undefined,
          spreadsheet_id: picked.id, page_name: label.trim() || picked.name,
          tabs: tabsPayload,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Lỗi lưu');
      window.location.reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Lỗi'); setBusy(false); setConfirmOpen(false); }
  };

  // Map 1 dòng dữ liệu mẫu của 1 tab vào các trường CRM (demo).
  const mapRowFor = (f: TabForm, r: string[]) => {
    const phone = f.phoneCol != null ? (r[f.phoneCol] ?? '') : '';
    const name = f.nameCol != null ? (r[f.nameCol] ?? '') : '';
    const source = f.sourceMode === 'column'
      ? (f.sourceCol != null ? (r[f.sourceCol] ?? '') : '')
      : sourceLabel(f.source || DEFAULT_SHEET_SOURCE);
    let model = '(tự nhận diện)';
    if (f.modelMode === 'fixed') model = models.find((m) => m.id === f.modelId)?.name ?? '—';
    else if (f.modelMode === 'column') model = f.modelCol != null ? (r[f.modelCol] ?? '') : '';
    return { phone, name, source, model };
  };

  // Demo theo từng tab: mỗi tab lấy tối đa 2 dòng mẫu (dùng preview + cấu hình riêng của tab).
  const demoByTab = selectedTabs.map((t) => {
    const f = tabForms[t]; const pv = previewByTab[t];
    const rows = f && pv
      ? (pv.sample ?? []).slice(0, 2).map((r) => mapRowFor(f, r)).filter((row) => row.phone || row.name)
      : [];
    return { tab: t, rows };
  });

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
      {dialog}
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
        <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50">
          <div className="text-sm font-semibold text-slate-800">
            {editingId ? 'Sửa kết nối' : 'Chọn tab cần lấy lead'} — {picked.name}
          </div>
          <p className="text-xs text-slate-500">
            File có {tabs.length} tab. Tick các tab muốn lấy lead, rồi bấm biểu tượng cấu hình để đặt
            <b> riêng từng tab</b> (thương hiệu, showroom, cột, nguồn, dòng xe, mốc thời gian).
          </p>

          {/* Tên/nhãn hiển thị */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tên hiển thị</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder={picked.name}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white" />
            <p className="text-[11px] text-slate-400 mt-1">Đặt tên dễ nhớ cho kết nối này (vd “Lead Tải Bus HN”). Để trống = tên file Google.</p>
          </div>

          {/* Danh sách tab: tick chọn + nút cấu hình */}
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => {
              const on = selectedTabs.includes(t);
              const isOpen = openTab === t;
              const f = tabForms[t];
              const configured = !!f && f.phoneCol != null && !!f.brandId && f.srIds.length > 0;
              return (
                <div key={t}
                  className={`flex items-center gap-1.5 rounded-lg border pl-1.5 pr-1 py-1 bg-white ${isOpen ? 'border-brand ring-1 ring-brand' : on ? 'border-brand' : 'border-slate-300'}`}>
                  <button type="button" onClick={() => toggleTab(t)} disabled={busy}
                    title={on ? 'Bỏ chọn tab' : 'Chọn tab'}
                    className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${on ? 'bg-brand text-white' : 'border border-slate-300 text-transparent'}`}>
                    <Check size={12} />
                  </button>
                  <span className={`text-sm ${on ? 'text-slate-800' : 'text-slate-400'}`}>{t}</span>
                  {on && !configured && <span className="text-amber-500 text-xs" title="Chưa cấu hình xong">•</span>}
                  {on && (
                    <button type="button" onClick={() => openConfigTab(t)} disabled={busy}
                      title="Cấu hình tab này"
                      className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isOpen ? 'bg-brand text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                      <Settings2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bảng cấu hình của tab đang mở */}
          {openTab && selectedTabs.includes(openTab) && previewByTab[openTab] && tabForms[openTab] && (
            <TabConfigPanel
              key={openTab}
              tab={openTab}
              form={tabForms[openTab]}
              onField={(k, v) => setTabField(openTab, k, v)}
              preview={previewByTab[openTab]}
              brands={brands} models={models} showrooms={showrooms}
            />
          )}
          {openTab && !previewByTab[openTab] && (
            <p className="text-xs text-slate-500">Đang tải cấu hình tab “{openTab}”…</p>
          )}

          <button onClick={requestSave} disabled={busy || selectedTabs.length === 0}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--color-brand)' }}>
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
                  className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2 py-1 border border-slate-200 hover:bg-slate-50 disabled:opacity-50" style={{ color: 'var(--color-brand)' }}>
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

      {/* Popup demo: dữ liệu thật của từng tab map vào các trường CRM */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 sticky top-0 bg-white">
              <div>
                <div className="text-sm font-bold text-slate-900">Xem trước dữ liệu lấy về</div>
                <div className="text-xs text-slate-400 mt-0.5">Kiểm tra cột đã map đúng chưa trước khi lưu — mỗi tab một cấu hình riêng.</div>
              </div>
              <button onClick={() => setConfirmOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {demoByTab.every((d) => d.rows.length === 0) ? (
                <p className="text-sm text-amber-600">Không có dòng dữ liệu mẫu để xem trước. Kiểm tra lại tab/cột đã chọn.</p>
              ) : (
                demoByTab.map((d) => (
                  <div key={d.tab}>
                    <div className="text-xs font-semibold text-slate-600 mb-1">Tab “{d.tab}”</div>
                    {d.rows.length === 0 ? (
                      <p className="text-[11px] text-slate-400">Không có dòng mẫu.</p>
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
                            {d.rows.map((row, i) => (
                              <tr key={i} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-medium text-slate-800">{row.phone || <span className="text-red-500">— trống —</span>}</td>
                                <td className="px-3 py-2 text-slate-700">{row.name || '—'}</td>
                                <td className="px-3 py-2 text-slate-700">{row.source || '—'}</td>
                                <td className="px-3 py-2 text-slate-700">{row.model || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              )}
              <p className="text-[11px] text-slate-400">
                Tiêu đề là trường trong CRM, dữ liệu là của sheet bạn. Nếu sai cột, bấm “Quay lại sửa” và chọn lại cột.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 sticky bottom-0 bg-white">
              <button onClick={() => setConfirmOpen(false)} disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
                Quay lại sửa
              </button>
              <button onClick={doSave} disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--color-brand)' }}>
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
                    <StatCard label="Lead cũ bỏ qua (trước mốc)" value={stats.lastSync?.skipped ?? 0} hint="Dòng có thời gian trước mốc đã chọn" />
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

// Bảng cấu hình ĐẦY ĐỦ cho 1 tab — mọi trường đọc/ghi qua form + onField (độc lập giữa các tab).
function TabConfigPanel({ tab, form, onField, preview, brands, models, showrooms }: {
  tab: string;
  form: TabForm;
  onField: <K extends keyof TabForm>(key: K, val: TabForm[K]) => void;
  preview: PreviewData;
  brands: BrandRow[]; models: ModelRow[]; showrooms: ShowroomRow[];
}) {
  const brandModels = models.filter((m) => m.brand_id === form.brandId && m.is_active);
  // Chỉ hiện showroom bán đúng thương hiệu đã chọn (UX — tránh tick nhầm showroom khác hãng).
  const brandShowrooms = form.brandId ? showrooms.filter((s) => s.brand_ids.includes(form.brandId)) : [];
  const toggleSr = (id: string) =>
    onField('srIds', form.srIds.includes(id) ? form.srIds.filter((s) => s !== id) : [...form.srIds, id]);
  // Đổi thương hiệu → bỏ chọn showroom không thuộc hãng mới + reset dòng xe (tránh cấu hình lệch).
  const changeBrand = (bid: string) => {
    onField('brandId', bid);
    onField('modelId', '');
    onField('srIds', form.srIds.filter((id) => {
      const sr = showrooms.find((x) => x.id === id);
      return !!bid && !!sr && sr.brand_ids.includes(bid);
    }));
  };
  // Danh sách tỉnh (khử trùng) từ showroom đã gán tỉnh — để chọn tỉnh mặc định khi định tuyến địa chỉ.
  const provinceOptions = Array.from(
    new Set(showrooms.map((s) => (s.province ?? '').trim()).filter(Boolean)),
  );

  return (
    <div className="rounded-xl border border-brand/40 p-4 space-y-4 bg-white">
      <div className="text-sm font-semibold text-slate-800">Cấu hình tab “{tab}”</div>

      {/* 1. Cột dữ liệu */}
      <div className="grid grid-cols-2 gap-3">
        <ColSelect label="Cột Số điện thoại" headers={preview.headers} value={form.phoneCol} onChange={(v) => onField('phoneCol', v)} />
        <ColSelect label="Cột Họ tên" headers={preview.headers} value={form.nameCol} onChange={(v) => onField('nameCol', v)} allowNone />
      </div>

      {/* 2. Thương hiệu */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Thương hiệu</label>
        <select value={form.brandId} onChange={(e) => changeBrand(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
          <option value="">— chọn —</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* 3. Nguồn lead */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-600">Nguồn lead</label>
        <Segmented value={form.sourceMode} onChange={(v) => onField('sourceMode', v as SourceMode)}
          options={[{ value: 'fixed', label: 'Gán cố định' }, { value: 'column', label: 'Lấy theo cột' }]} />
        {form.sourceMode === 'fixed' ? (
          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-400">Chọn nguồn data thật cho tab này (Google Sheet chỉ là kênh trung chuyển). Mặc định = Facebook.</p>
            <select value={form.source || DEFAULT_SHEET_SOURCE} onChange={(e) => onField('source', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white">
              {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ) : (
          <ColSelect label="Cột chứa Nguồn" headers={preview.headers} value={form.sourceCol} onChange={(v) => onField('sourceCol', v)} />
        )}
      </div>

      {/* 4. Dòng xe */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-600">Dòng xe</label>
        <Segmented value={form.modelMode} onChange={(v) => onField('modelMode', v as ModelMode)}
          options={[
            { value: 'auto', label: 'Tự nhận diện' },
            { value: 'fixed', label: '1 dòng cố định' },
            { value: 'column', label: 'Lấy theo cột' },
          ]} />
        {form.modelMode === 'auto' && (
          <p className="text-[11px] text-slate-400">Hệ thống tự dò dòng xe theo từ khoá (tên + ghi chú), chỉ điền khi trúng đúng 1 dòng.</p>
        )}
        {form.modelMode === 'fixed' && (
          <div>
            {!form.brandId
              ? <p className="text-[11px] text-amber-600">Chọn thương hiệu trước để chọn dòng xe.</p>
              : (
                <select value={form.modelId} onChange={(e) => onField('modelId', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white">
                  <option value="">— chọn dòng xe —</option>
                  {brandModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
          </div>
        )}
        {form.modelMode === 'column' && (
          <ColSelect label="Cột chứa Dòng xe" headers={preview.headers} value={form.modelCol} onChange={(v) => onField('modelCol', v)} />
        )}
      </div>

      {/* 5. Mốc thời gian — chống nạp toàn bộ lead cũ khi kết nối sheet đã tích luỹ lâu */}
      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <label className="block text-xs font-semibold text-slate-700">Mốc thời gian (chỉ lấy lead mới)</label>
        <p className="text-[11px] text-slate-500">
          Sheet thường tích luỹ nhiều lead cũ. Chọn cột thời gian + ngày bắt đầu để hệ thống
          CHỈ nạp lead từ mốc đó trở đi — tránh nổ hàng loạt thông báo lead cũ. Bỏ trống cột = nạp tất cả (không khuyến nghị).
        </p>
        <ColSelect label="Cột chứa thời gian" headers={preview.headers} value={form.dateCol} onChange={(v) => onField('dateCol', v)} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 w-32 shrink-0">Chỉ lấy lead từ ngày</span>
          <input type="date" value={form.since} onChange={(e) => onField('since', e.target.value)}
            disabled={form.dateCol == null}
            className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400" />
        </div>
      </div>

      {/* 6. Định tuyến theo địa chỉ — đọc tỉnh từ 1 cột, giao về showroom của tỉnh đó */}
      <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
        <label className="block text-xs font-semibold text-slate-700">Định tuyến theo địa chỉ (tuỳ chọn)</label>
        <p className="text-[11px] text-slate-500">
          Nếu sheet có cột địa chỉ (tỉnh/thành), chọn cột đó → hệ thống giao lead về showroom của tỉnh
          tương ứng (vd Ninh Bình → showroom Ninh Bình; Hà Nội → chia đều các showroom Hà Nội). Cần đặt
          tỉnh cho từng showroom ở mục “Showroom” bên dưới. Bỏ trống = không định tuyến theo địa chỉ.
        </p>
        <ColSelect label="Cột chứa địa chỉ" headers={preview.headers} value={form.addressCol} onChange={(v) => onField('addressCol', v)} allowNone />
        {form.addressCol != null && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600 w-40 shrink-0">Không nhận ra tỉnh → giao về</span>
            <select value={form.addressFallback} onChange={(e) => onField('addressFallback', e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white">
              <option value="">— giữ theo showroom đã chọn —</option>
              {provinceOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* 7. Showroom nhận lead — chỉ hiện showroom bán đúng thương hiệu đã chọn */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-600">Showroom nhận lead</label>
        {!form.brandId ? (
          <p className="text-[11px] text-amber-600">Chọn thương hiệu trước để hiện danh sách showroom.</p>
        ) : brandShowrooms.length === 0 ? (
          <p className="text-[11px] text-amber-600">Chưa có showroom nào bán thương hiệu này.</p>
        ) : (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {brandShowrooms.map((s) => {
              const checked = form.srIds.includes(s.id);
              return (
                <label key={s.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors"
                  style={{ borderColor: checked ? 'var(--color-brand)' : '#e2e8f0', background: checked ? '#e6f0fa' : '#fff' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleSr(s.id)} className="accent-brand" />
                  <span className="text-sm font-medium text-slate-700">{s.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
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
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'bg-brand text-white' : 'text-slate-600 hover:text-slate-900'}`}>
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
