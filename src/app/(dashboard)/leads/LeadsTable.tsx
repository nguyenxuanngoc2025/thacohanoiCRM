'use client';

import React, { useState, useMemo, useTransition, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  PhoneCall, Check, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft,
  SlidersHorizontal, UserPlus, Search, Download, AlertTriangle, ListFilter,
} from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/phone';
import { STATUS_OPTIONS, FAIL_REASONS, isContacted, type LeadStatus } from '@/lib/lead-status';
import { sourceLabel, sourcePlatform } from '@/lib/source';
import { classifyLead, markContacted, unmarkContacted, bulkReassign } from './actions';
import type { ModelOption, BrandOption, ShowroomOption, AssigneeOption } from './LeadsView';
import LeadDrawer from './LeadDrawer';
import NewLeadModal from './NewLeadModal';

export interface LeadRow {
  id: string;
  full_name: string | null;
  phone: string;
  source: string | null;
  status: LeadStatus | null;
  created_at: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  last_note: string | null;
  brand_id: string;
  brand_name: string;
  model_id: string | null;
  model_name: string | null;
  showroom_id: string | null;
  showroom_name: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  contact_count: number;
  fail_reason: string | null;
  no_answer_count: number;
}

// ─── Bộ lọc phạm vi (nâng lên LeadsView để KPI nhảy theo) ───────────────────────
export interface Filters {
  q: string;
  showroom: string;
  brand: string;
  model: string;
  source: string;
  assignee: string; // '' = tất cả, '__none__' = chưa giao, còn lại = id
  status: string;   // '' = tất cả, '__none__' = chưa phân loại, còn lại = code
  month: string;    // '' = tất cả, 'YYYY-MM'
}

export const EMPTY_FILTERS: Filters = {
  q: '', showroom: '', brand: '', model: '', source: '', assignee: '', status: '', month: '',
};

/** Lead quá hạn chăm sóc: có hẹn gọi lại đã qua VÀ chưa chốt/loại. */
export function isOverdue(l: LeadRow): boolean {
  if (!l.next_contact_at) return false;
  if (l.status === 'KHĐ' || l.status === 'Fail') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(l.next_contact_at) < today;
}

/** Áp các bộ lọc phạm vi (KHÔNG gồm tab/sort — phần đó nằm trong bảng). */
export function applyScope(leads: LeadRow[], f: Filters): LeadRow[] {
  const q = f.q.trim().toLowerCase();
  return leads.filter((l) => {
    if (q && !`${l.full_name ?? ''} ${l.phone}`.toLowerCase().includes(q)) return false;
    if (f.showroom && l.showroom_name !== f.showroom) return false;
    if (f.brand && l.brand_name !== f.brand) return false;
    if (f.model && l.model_name !== f.model) return false;
    if (f.source && sourcePlatform(l.source) !== f.source) return false;
    if (f.assignee) {
      if (f.assignee === '__none__') { if (l.assigned_to) return false; }
      else if (l.assigned_to !== f.assignee) return false;
    }
    if (f.status) {
      if (f.status === '__none__') { if (l.status) return false; }
      else if (l.status !== f.status) return false;
    }
    if (f.month && l.created_at.slice(0, 7) !== f.month) return false;
    return true;
  });
}

type Tab = 'all' | 'pending' | 'contacted' | 'overdue';
type ColKey =
  | 'time' | 'name' | 'phone' | 'showroom' | 'brand' | 'model' | 'platform' | 'assignee'
  | 'contacted' | 'class' | 'contactedAt' | 'note' | 'source' | 'next' | 'count';

const STATUS_ORDER: Record<string, number> = Object.fromEntries(
  STATUS_OPTIONS.map((s, i) => [s.code, i]),
);

// Mốc thời gian (null = -1 để cuộn lên đầu khi sort tăng dần)
const tsOrNeg = (v: string | null) => (v ? Date.parse(v) : -1);

function compare(key: ColKey, a: LeadRow, b: LeadRow): number {
  switch (key) {
    case 'time': return Date.parse(a.created_at) - Date.parse(b.created_at);
    case 'name': return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'vi');
    case 'phone': return a.phone.localeCompare(b.phone);
    case 'showroom': return (a.showroom_name ?? '').localeCompare(b.showroom_name ?? '', 'vi');
    case 'brand': return a.brand_name.localeCompare(b.brand_name, 'vi');
    case 'model': return (a.model_name ?? '').localeCompare(b.model_name ?? '', 'vi');
    case 'assignee': return (a.assignee_name ?? '').localeCompare(b.assignee_name ?? '', 'vi');
    case 'contacted': return (isContacted(a.last_contact_at) ? 1 : 0) - (isContacted(b.last_contact_at) ? 1 : 0);
    case 'class': return (STATUS_ORDER[a.status ?? ''] ?? 99) - (STATUS_ORDER[b.status ?? ''] ?? 99);
    case 'contactedAt': return tsOrNeg(a.last_contact_at) - tsOrNeg(b.last_contact_at);
    case 'note': return (a.last_note ?? '').localeCompare(b.last_note ?? '', 'vi');
    case 'platform': return sourcePlatform(a.source).localeCompare(sourcePlatform(b.source), 'vi');
    case 'source': return sourceLabel(a.source).localeCompare(sourceLabel(b.source), 'vi');
    case 'next': return tsOrNeg(a.next_contact_at) - tsOrNeg(b.next_contact_at);
    case 'count': return a.contact_count - b.contact_count;
  }
}

interface ColDef { key: ColKey; label: string; pad: string }

const COLS: ColDef[] = [
  { key: 'time', label: 'Thời gian', pad: 'px-4' },
  { key: 'name', label: 'Khách hàng', pad: 'px-5' },
  { key: 'phone', label: 'SĐT', pad: 'px-4' },
  { key: 'contacted', label: 'Trạng thái', pad: 'px-4' },
  { key: 'class', label: 'Phân loại', pad: 'px-4' },
  { key: 'platform', label: 'Nguồn', pad: 'px-4' },
  { key: 'brand', label: 'Thương hiệu', pad: 'px-4' },
  { key: 'showroom', label: 'Showroom', pad: 'px-4' },
  { key: 'assignee', label: 'Phụ trách', pad: 'px-4' },
  { key: 'source', label: 'Chi tiết kênh', pad: 'px-4' },
  { key: 'model', label: 'Dòng xe', pad: 'px-4' },
  { key: 'contactedAt', label: 'Liên hệ lúc', pad: 'px-4' },
  { key: 'note', label: 'Nội dung liên hệ', pad: 'px-4' },
  { key: 'next', label: 'Hẹn gọi lại', pad: 'px-4' },
  { key: 'count', label: 'Số lần LH', pad: 'px-4' },
];

// Cột thông tin KH được đóng băng khi cuộn ngang (theo thứ tự, có width cố định)
const STICKY: ColKey[] = ['time', 'name', 'phone'];
const STICKY_W: Record<string, number> = { time: 150, name: 180, phone: 140 };
const SEL_W = 44;

const STORAGE_KEY = 'leads.cols.v5';
const DEFAULT_HIDDEN: ColKey[] = ['source', 'model', 'contactedAt', 'note', 'next', 'count'];

const fmtDate = (v: string) => new Date(v).toLocaleString('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const fmtDay = (v: string) => new Date(v).toLocaleDateString('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

const uniqSorted = (arr: (string | null)[]) =>
  [...new Set(arr.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'vi'));

interface Opt { value: string; label: string }

// Dropdown filter tuỳ biến (button + popup fixed mở xuống) — tránh native select mở ngược lên
function Filter({ value, onChange, placeholder, options }: {
  value: string; onChange: (v: string) => void; placeholder: string; options: Opt[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const active = value !== '';
  const current = options.find((o) => o.value === value);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 180) });
    setOpen(true);
  };

  const pick = (v: string) => { onChange(v); setOpen(false); };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="inline-flex items-center gap-1.5 text-sm border rounded-lg px-2.5 py-1.5 outline-none transition-colors"
        style={{
          borderColor: active ? '#004B9B' : '#e2e8f0',
          background: active ? '#e6f0fa' : '#fff',
          color: active ? '#004B9B' : '#64748b',
          fontWeight: active ? 600 : 400,
        }}
      >
        {active ? (current?.label ?? value) : placeholder}
        <ChevronDown size={13} className="opacity-60" />
      </button>
      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, maxHeight: 280, overflowY: 'auto',
            }}
          >
            <button
              onClick={() => pick('')}
              className="block w-full text-left text-sm rounded-md px-2.5 py-1.5 hover:bg-slate-50"
              style={{ color: !active ? '#004B9B' : '#475569', fontWeight: !active ? 600 : 400 }}
            >
              {placeholder}
            </button>
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => pick(o.value)}
                className="block w-full text-left text-sm rounded-md px-2.5 py-1.5 hover:bg-slate-50"
                style={{ color: value === o.value ? '#004B9B' : '#475569', fontWeight: value === o.value ? 600 : 400 }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// Chọn phân loại / đổi trạng thái liên hệ — popup tuỳ biến (đẹp + đồng bộ với Filter).
// Cột Phân loại: luôn mở picker phân loại (chọn 1 phân loại = vừa đánh dấu đã liên hệ
// vừa set status). Cột Trạng thái: lần đầu (chưa liên hệ) mở picker phân loại; khi đã
// liên hệ thì click mở popup ĐỔI LẠI trạng thái (đã/chưa liên hệ).
// Quy tắc: đã liên hệ BẮT BUỘC có phân loại (không có "bỏ phân loại"); Fail kèm lý do;
// "Chưa LH được" hiển thị số lần đã gọi hụt.
function StatusPicker({ lead, variant, pending, start }: {
  lead: LeadRow;
  variant: 'contacted' | 'class';
  pending: boolean;
  start: (cb: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const [failStep, setFailStep] = useState(false);
  const [khac, setKhac] = useState<string | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const contacted = isContacted(lead.last_contact_at);
  const status = lead.status;
  const opt = status ? STATUS_OPTIONS.find((s) => s.code === status) : null;

  // Cột Trạng thái + đã liên hệ → popup đổi trạng thái; còn lại → picker phân loại.
  const mode: 'classify' | 'toggle' = variant === 'contacted' && contacted ? 'toggle' : 'classify';

  const close = () => { setOpen(false); setFailStep(false); setKhac(null); };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) { close(); return; }
    setFailStep(false); setKhac(null);
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const below = window.innerHeight - r.bottom;
      // Gần đáy màn hình → lật lên trên để không bị footer/scrollbar che.
      if (below < 300 && r.top > below) setPos({ left: r.left, bottom: window.innerHeight - r.top + 4 });
      else setPos({ left: r.left, top: r.bottom + 4 });
    }
    setOpen(true);
  };

  const pickStatus = (code: LeadStatus) => {
    if (code === 'Fail') { setFailStep(true); return; } // Fail → bước chọn lý do
    close();
    start(() => classifyLead(lead.id, code));
  };
  const pickReason = (reason: string) => { close(); start(() => classifyLead(lead.id, 'Fail', reason)); };
  const confirmKhac = () => { const v = (khac ?? '').trim() || 'Khác'; close(); start(() => classifyLead(lead.id, 'Fail', v)); };
  const markOnly = () => { close(); start(() => markContacted(lead.id)); };
  const unmark = () => { close(); start(() => unmarkContacted(lead.id)); };

  // Nhãn pill: "Chưa LH được" kèm số lần gọi hụt; tiêu đề Fail hiện lý do.
  const count = lead.no_answer_count;
  const pillLabel = opt
    ? (status === 'Chưa LH được' && count > 0 ? `${opt.code} ·${count}` : opt.code)
    : '';
  const pillTitle = status === 'Fail' && lead.fail_reason ? `Lý do loại: ${lead.fail_reason}` : undefined;

  let trigger: React.ReactNode;
  if (variant === 'contacted') {
    trigger = contacted ? (
      <button ref={btnRef} disabled={pending} onClick={toggle}
        className="inline-flex items-center justify-center gap-1 min-w-[112px] text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1 hover:bg-emerald-100 disabled:opacity-50">
        <Check size={13} /> Đã liên hệ <ChevronDown size={11} className="opacity-60" />
      </button>
    ) : (
      <button ref={btnRef} disabled={pending} onClick={toggle}
        className="inline-flex items-center justify-center gap-1 min-w-[112px] text-xs font-medium text-[#004B9B] border border-blue-200 rounded-full px-2.5 py-1 hover:bg-blue-50 disabled:opacity-50">
        <PhoneCall size={12} /> Chưa liên hệ
      </button>
    );
  } else if (!contacted) {
    // Chưa liên hệ → chưa được phân loại. Hiển thị dấu '—', click không có tác dụng.
    trigger = (
      <span title="Cần đánh dấu đã liên hệ trước khi phân loại" className="text-slate-300 text-sm select-none">—</span>
    );
  } else {
    trigger = opt ? (
      <button ref={btnRef} disabled={pending} onClick={toggle} title={pillTitle}
        className="inline-flex items-center justify-center gap-1 min-w-[96px] text-xs font-medium rounded-full px-2.5 py-1 disabled:opacity-50"
        style={{ color: opt.color, background: opt.bg }}>
        {pillLabel} <ChevronDown size={11} className="opacity-60" />
      </button>
    ) : (
      <button ref={btnRef} disabled={pending} onClick={toggle}
        className="inline-flex items-center justify-center gap-1 min-w-[96px] text-xs text-slate-400 border border-dashed border-slate-300 rounded-full px-2.5 py-1 hover:border-slate-400 hover:text-slate-500 disabled:opacity-50">
        Phân loại <ChevronDown size={11} className="opacity-60" />
      </button>
    );
  }

  return (
    <>
      {trigger}
      {open && pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={(e) => { e.stopPropagation(); close(); }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: 220, zIndex: 9999,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6,
              maxHeight: '70vh', overflowY: 'auto',
            }}
          >
            {mode === 'toggle' ? (
              <>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-2 py-1">Trạng thái liên hệ</div>
                <button onClick={() => close()}
                  className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 text-emerald-700">
                  <Check size={14} /> Đã liên hệ
                </button>
                <button onClick={unmark}
                  className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 text-slate-600">
                  <PhoneCall size={13} /> Chưa liên hệ
                </button>
              </>
            ) : failStep ? (
              <>
                <div className="flex items-center gap-1.5 px-1 py-1">
                  <button onClick={() => { setFailStep(false); setKhac(null); }}
                    className="text-slate-400 hover:text-slate-600 p-0.5">
                    <ChevronLeft size={15} />
                  </button>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Lý do loại</span>
                </div>
                {FAIL_REASONS.map((r) => (
                  r === 'Khác' ? (
                    khac === null ? (
                      <button key={r} onClick={() => setKhac('')}
                        className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 text-slate-600">
                        Khác (nhập tay)…
                      </button>
                    ) : (
                      <div key={r} className="px-1 py-1">
                        <input
                          autoFocus
                          value={khac}
                          onChange={(e) => setKhac(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') confirmKhac(); }}
                          placeholder="Nhập lý do…"
                          className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 outline-none focus:border-[#004B9B]"
                        />
                        <button onClick={confirmKhac}
                          className="mt-1.5 w-full text-sm font-medium text-white rounded-md px-2 py-1.5"
                          style={{ background: '#004B9B' }}>
                          Lưu lý do
                        </button>
                      </div>
                    )
                  ) : (
                    <button key={r} onClick={() => pickReason(r)}
                      className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 text-slate-600">
                      {r}
                    </button>
                  )
                ))}
              </>
            ) : (
              <>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-2 py-1">Phân loại khách</div>
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.code}
                    onClick={() => pickStatus(s.code)}
                    className="flex items-center gap-2 w-full text-left rounded-md px-2 py-1.5 hover:bg-slate-50"
                    style={{ background: status === s.code ? s.bg : undefined }}
                  >
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-sm font-medium" style={{ color: s.color }}>{s.code}</span>
                    <span className="text-xs text-slate-400 truncate">{s.label}</span>
                  </button>
                ))}
                {!contacted && (
                  <>
                    <div className="h-px bg-slate-100 my-1" />
                    <button onClick={markOnly}
                      className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 text-[#004B9B]">
                      <PhoneCall size={13} /> Chỉ đánh dấu đã liên hệ
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

export default function LeadsTable({
  leads, allLeads, filters, setFilters, models, brands, showrooms, assignees, canCreate, canAssign,
}: {
  leads: LeadRow[];
  allLeads: LeadRow[];
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  models: ModelOption[];
  brands: BrandOption[];
  showrooms: ShowroomOption[];
  assignees: AssigneeOption[];
  canCreate: boolean;
  canAssign: boolean;
}) {
  const [tab, setTab] = useState<Tab>('all');
  const [showNew, setShowNew] = useState(false);
  const [sortKey, setSortKey] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState<Set<ColKey>>(new Set(DEFAULT_HIDDEN));
  const [colMenu, setColMenu] = useState(false);
  const [openLead, setOpenLead] = useState<LeadRow | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [filterMenu, setFilterMenu] = useState(false);

  // Khôi phục cấu hình cột hiển thị
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw) as ColKey[]));
    } catch { /* ignore */ }
  }, []);

  // Bỏ chọn khi tập lead theo bộ lọc thay đổi
  useEffect(() => { setSel(new Set()); }, [leads]);

  const toggleCol = (key: ColKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const setF = (k: keyof Filters, v: string) =>
    setFilters((prev) => ({ ...prev, [k]: v, ...(k === 'brand' ? { model: '' } : {}) }));

  // Số bộ lọc đang bật (không tính ô tìm kiếm — nó có ô riêng).
  const activeFilters = [filters.month, filters.showroom, filters.brand, filters.model, filters.source, filters.assignee, filters.status].filter(Boolean).length;
  const clearFilters = () => setFilters((prev) => ({ ...EMPTY_FILTERS, q: prev.q }));

  const visibleCols = COLS.filter((c) => !hidden.has(c.key));

  // Tính offset trái cho các cột đóng băng (chỉ những cột đang hiện); chừa chỗ cột chọn.
  const leftMap: Partial<Record<ColKey, number>> = {};
  let acc = canAssign ? SEL_W : 0;
  for (const c of visibleCols) {
    if (STICKY.includes(c.key)) { leftMap[c.key] = acc; acc += STICKY_W[c.key]; }
  }
  const stickyStyle = (key: ColKey, header: boolean, over = false): React.CSSProperties => {
    if (leftMap[key] === undefined) return {};
    const isLast = STICKY.filter((k) => leftMap[k] !== undefined).slice(-1)[0] === key;
    return {
      position: 'sticky',
      left: leftMap[key],
      width: STICKY_W[key],
      minWidth: STICKY_W[key],
      zIndex: header ? 20 : 1,
      background: header ? '#f8fafc' : over ? '#fff1f2' : '#fff',
      boxShadow: isLast ? '2px 0 4px -2px rgba(0,0,0,0.08)' : undefined,
    };
  };

  const counts = {
    all: leads.length,
    pending: leads.filter((l) => !isContacted(l.last_contact_at)).length,
    contacted: leads.filter((l) => isContacted(l.last_contact_at)).length,
    overdue: leads.filter(isOverdue).length,
  };

  // ─── Tuỳ chọn cho các bộ lọc (xây từ TOÀN bộ lead, không bị thu hẹp) ──────────
  const showroomOpts = useMemo<Opt[]>(
    () => uniqSorted(allLeads.map((l) => l.showroom_name)).map((s) => ({ value: s, label: s })),
    [allLeads],
  );
  const brandOpts = useMemo<Opt[]>(
    () => uniqSorted(allLeads.map((l) => l.brand_name)).map((s) => ({ value: s, label: s })),
    [allLeads],
  );
  const modelOpts = useMemo<Opt[]>(
    () => uniqSorted(allLeads.filter((l) => !filters.brand || l.brand_name === filters.brand).map((l) => l.model_name))
      .map((s) => ({ value: s, label: s })),
    [allLeads, filters.brand],
  );
  const sourceOpts = useMemo<Opt[]>(
    () => uniqSorted(allLeads.map((l) => sourcePlatform(l.source))).map((s) => ({ value: s, label: s })),
    [allLeads],
  );
  const assigneeOpts = useMemo<Opt[]>(() => {
    const base = assignees.map((a) => ({ value: a.id, label: a.full_name }));
    return allLeads.some((l) => !l.assigned_to) ? [{ value: '__none__', label: 'Chưa giao' }, ...base] : base;
  }, [assignees, allLeads]);
  const statusOpts = useMemo<Opt[]>(() => [
    { value: '__none__', label: 'Chưa phân loại' },
    ...STATUS_OPTIONS.map((s) => ({ value: s.code, label: `${s.code} · ${s.label}` })),
  ], []);
  const monthOpts = useMemo<Opt[]>(() => {
    const set = new Set(allLeads.map((l) => l.created_at.slice(0, 7)));
    return [...set].sort().reverse().map((m) => {
      const [y, mm] = m.split('-');
      return { value: m, label: `Tháng ${parseInt(mm, 10)}/${y}` };
    });
  }, [allLeads]);

  const rows = useMemo(() => {
    const filtered = leads.filter((l) => {
      if (tab === 'contacted' && !isContacted(l.last_contact_at)) return false;
      if (tab === 'pending' && isContacted(l.last_contact_at)) return false;
      if (tab === 'overdue' && !isOverdue(l)) return false;
      return true;
    });
    if (!sortKey) return filtered;
    const sorted = [...filtered].sort((a, b) => compare(sortKey, a, b));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [leads, tab, sortKey, sortDir]);

  const onSort = (key: ColKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleOne = (id: string) => setSel((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const doBulk = () => {
    const val = bulkAssignee === '__none__' ? null : bulkAssignee;
    const ids = [...sel];
    start(async () => {
      const r = await bulkReassign(ids, val);
      if (r.ok) { setSel(new Set()); setBulkAssignee(''); }
    });
  };

  const exportCsv = () => {
    const headers = [
      'Thời gian', 'Khách hàng', 'SĐT', 'Trạng thái', 'Phân loại', 'Lý do loại',
      'Nguồn', 'Chi tiết kênh', 'Thương hiệu', 'Dòng xe', 'Showroom', 'Phụ trách',
      'Số lần LH', 'Gọi hụt', 'Hẹn gọi lại', 'Nội dung liên hệ',
    ];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((l) => [
      fmtDate(l.created_at), l.full_name ?? '', formatPhoneDisplay(l.phone),
      isContacted(l.last_contact_at) ? 'Đã liên hệ' : 'Chưa liên hệ', l.status ?? '', l.fail_reason ?? '',
      sourcePlatform(l.source), sourceLabel(l.source), l.brand_name, l.model_name ?? '',
      l.showroom_name ?? '', l.assignee_name ?? '', l.contact_count, l.no_answer_count,
      l.next_contact_at ? fmtDay(l.next_contact_at) : '', l.last_note ?? '',
    ].map(cell).join(','));
    const csv = '\uFEFF' + [headers.map(cell).join(','), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'pending', label: 'Chưa liên hệ' },
    { key: 'contacted', label: 'Đã liên hệ' },
    { key: 'overdue', label: 'Quá hạn' },
  ];

  const renderCell = (key: ColKey, l: LeadRow) => {
    const contacted = isContacted(l.last_contact_at);
    switch (key) {
      case 'contacted':
        return <StatusPicker lead={l} variant="contacted" pending={pending} start={start} />;
      case 'class':
        return <StatusPicker lead={l} variant="class" pending={pending} start={start} />;
      case 'time': return <span className="text-slate-500">{fmtDate(l.created_at)}</span>;
      case 'name': return <span className="font-medium text-slate-800">{l.full_name ?? '—'}</span>;
      case 'phone': return <span className="text-slate-600">{formatPhoneDisplay(l.phone)}</span>;
      case 'showroom': return <span className="text-slate-600">{l.showroom_name ?? '—'}</span>;
      case 'brand': return <span className="text-slate-600">{l.brand_name}</span>;
      case 'model': return <span className="text-slate-600">{l.model_name ?? '—'}</span>;
      case 'assignee': return <span className="text-slate-600">{l.assignee_name ?? '—'}</span>;
      case 'contactedAt':
        return <span className="text-slate-500">{contacted ? fmtDate(l.last_contact_at!) : '—'}</span>;
      case 'note':
        return <span className="text-slate-500 line-clamp-1 max-w-[220px] inline-block align-bottom">{l.last_note ?? '—'}</span>;
      case 'platform': return <span className="text-slate-600">{sourcePlatform(l.source)}</span>;
      case 'source': return <span className="text-slate-500">{sourceLabel(l.source)}</span>;
      case 'next':
        return l.next_contact_at ? (
          <span className={isOverdue(l) ? 'inline-flex items-center gap-1 text-rose-600 font-medium' : 'text-slate-500'}>
            {isOverdue(l) && <AlertTriangle size={12} />}{fmtDay(l.next_contact_at)}
          </span>
        ) : <span className="text-slate-500">—</span>;
      case 'count': return <span className="text-slate-600 tabular-nums">{l.contact_count}</span>;
    }
  };

  const colSpan = visibleCols.length + (canAssign ? 1 : 0);

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center flex-wrap gap-2 px-6 py-3 border-b border-slate-100 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="text-sm rounded-full px-3 py-1 transition-colors"
            style={{
              fontWeight: tab === t.key ? 600 : 500,
              color: tab === t.key ? (t.key === 'overdue' ? '#be123c' : '#004B9B') : (t.key === 'overdue' && counts.overdue > 0 ? '#e11d48' : '#64748b'),
              background: tab === t.key ? (t.key === 'overdue' ? '#fff1f2' : '#e6f0fa') : 'transparent',
            }}
          >
            {t.label} <span className="opacity-60">({counts[t.key]})</span>
          </button>
        ))}

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={filters.q}
            onChange={(e) => setF('q', e.target.value)}
            placeholder="Tìm tên / SĐT"
            className="text-sm border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 outline-none focus:border-[#004B9B] w-44"
          />
        </div>

        <div className="relative">
          <button
            onClick={() => setFilterMenu((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm border rounded-lg px-2.5 py-1.5 transition-colors"
            style={{
              borderColor: activeFilters ? '#004B9B' : '#e2e8f0',
              background: activeFilters ? '#e6f0fa' : '#fff',
              color: activeFilters ? '#004B9B' : '#64748b',
              fontWeight: activeFilters ? 600 : 400,
            }}
          >
            <ListFilter size={14} /> Bộ lọc
            {activeFilters > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] text-[11px] font-semibold text-white rounded-full px-1" style={{ background: '#004B9B' }}>
                {activeFilters}
              </span>
            )}
          </button>
          {filterMenu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setFilterMenu(false)} />
              <div className="absolute left-0 mt-1 z-30 w-64 bg-white rounded-xl shadow-lg border border-slate-200 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Bộ lọc</span>
                  {activeFilters > 0 && (
                    <button onClick={clearFilters} className="text-xs text-rose-600 hover:underline">Xoá lọc</button>
                  )}
                </div>
                {[
                  { label: 'Tháng', value: filters.month, key: 'month' as const, ph: 'Tất cả tháng', opts: monthOpts },
                  { label: 'Showroom', value: filters.showroom, key: 'showroom' as const, ph: 'Tất cả showroom', opts: showroomOpts },
                  { label: 'Thương hiệu', value: filters.brand, key: 'brand' as const, ph: 'Tất cả thương hiệu', opts: brandOpts },
                  { label: 'Dòng xe', value: filters.model, key: 'model' as const, ph: 'Tất cả dòng xe', opts: modelOpts },
                  { label: 'Nguồn', value: filters.source, key: 'source' as const, ph: 'Tất cả nguồn', opts: sourceOpts },
                  { label: 'Phụ trách', value: filters.assignee, key: 'assignee' as const, ph: 'Tất cả phụ trách', opts: assigneeOpts },
                  { label: 'Phân loại', value: filters.status, key: 'status' as const, ph: 'Tất cả phân loại', opts: statusOpts },
                ].map((f) => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-500">{f.label}</span>
                    <Filter value={f.value} onChange={(v) => setF(f.key, v)} placeholder={f.ph} options={f.opts} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
          >
            <Download size={14} /> Xuất CSV
          </button>
          <div className="relative">
            <button
              onClick={() => setColMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
            >
              <SlidersHorizontal size={14} /> Cột hiển thị
            </button>
            {colMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setColMenu(false)} />
                <div className="absolute right-0 mt-1 z-30 w-56 bg-white rounded-xl shadow-lg border border-slate-200 p-2 max-h-[70vh] overflow-y-auto">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-2 py-1.5">Tùy chỉnh cột</div>
                  {COLS.map((c) => (
                    <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={!hidden.has(c.key)}
                        onChange={() => toggleCol(c.key)}
                        className="accent-[#004B9B]"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          {canCreate && (
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-1.5 hover:opacity-90"
              style={{ background: '#004B9B' }}
            >
              <UserPlus size={15} /> Thêm lead
            </button>
          )}
        </div>
      </div>

      {canAssign && sel.size > 0 && (
        <div className="flex items-center flex-wrap gap-2 px-6 py-2.5 bg-blue-50 border-b border-blue-100 shrink-0">
          <span className="text-sm font-semibold text-[#004B9B]">Đã chọn {sel.size} lead</span>
          <select
            value={bulkAssignee}
            onChange={(e) => setBulkAssignee(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-[#004B9B] outline-none"
          >
            <option value="">— Chọn người phụ trách —</option>
            <option value="__none__">Bỏ phụ trách</option>
            {assignees.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
          <button
            onClick={doBulk}
            disabled={pending || !bulkAssignee}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
            style={{ background: '#004B9B' }}
          >
            <UserPlus size={14} /> Gán hàng loạt
          </button>
          <button
            onClick={() => setSel(new Set())}
            className="text-sm text-slate-500 hover:text-slate-700 px-2 py-1.5"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      <div data-table-scroll className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide shadow-sm">
            <tr>
              {canAssign && (
                <th
                  className="px-3 py-3"
                  style={{ position: 'sticky', left: 0, width: SEL_W, minWidth: SEL_W, zIndex: 20, background: '#f8fafc' }}
                >
                  <input
                    type="checkbox"
                    className="accent-[#004B9B] align-middle"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
              )}
              {visibleCols.map((c) => {
                const active = sortKey === c.key;
                return (
                  <th key={c.key} className={`${c.pad} py-3 font-semibold whitespace-nowrap`} style={stickyStyle(c.key, true)}>
                    <button
                      onClick={() => onSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-[#004B9B] transition-colors uppercase"
                      style={{ color: active ? '#004B9B' : undefined }}
                    >
                      {c.label}
                      {active
                        ? (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)
                        : <ChevronsUpDown size={12} className="opacity-30" />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const over = isOverdue(l);
              return (
                <tr
                  key={l.id}
                  onClick={() => setOpenLead(l)}
                  className={`border-t border-slate-100 cursor-pointer ${over ? 'bg-rose-50/60 hover:bg-rose-100/50' : 'hover:bg-slate-50/60'}`}
                >
                  {canAssign && (
                    <td
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-3"
                      style={{ position: 'sticky', left: 0, width: SEL_W, minWidth: SEL_W, zIndex: 1, background: over ? '#fff1f2' : '#fff' }}
                    >
                      <input
                        type="checkbox"
                        className="accent-[#004B9B] align-middle"
                        checked={sel.has(l.id)}
                        onChange={() => toggleOne(l.id)}
                      />
                    </td>
                  )}
                  {visibleCols.map((c) => (
                    <td key={c.key} className={`${c.pad} py-3 whitespace-nowrap`} style={stickyStyle(c.key, false, over)}>
                      {renderCell(c.key, l)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={colSpan} className="px-4 py-12 text-center text-slate-400">Không có lead nào.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openLead && (
        <LeadDrawer
          lead={openLead}
          models={models}
          assignees={assignees}
          canManage={canCreate}
          onClose={() => setOpenLead(null)}
        />
      )}

      {showNew && (
        <NewLeadModal
          brands={brands}
          showrooms={showrooms}
          models={models}
          assignees={assignees}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}
