'use client';

import React, { useState, useMemo, useTransition, useEffect } from 'react';
import { PhoneCall, Check, ChevronUp, ChevronDown, ChevronsUpDown, SlidersHorizontal } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/phone';
import { STATUS_OPTIONS, isContacted, type LeadStatus } from '@/lib/lead-status';
import { setLeadStatus, markContacted } from './actions';
import type { ModelOption } from './LeadsView';
import LeadDrawer from './LeadDrawer';

export interface LeadRow {
  id: string;
  full_name: string | null;
  phone: string;
  source: string | null;
  status: LeadStatus;
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
  assignee_name: string | null;
  contact_count: number;
}

type Tab = 'all' | 'pending' | 'contacted';
type ColKey =
  | 'time' | 'name' | 'phone' | 'showroom' | 'brand' | 'model' | 'assignee'
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
    case 'class': return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
    case 'contactedAt': return tsOrNeg(a.last_contact_at) - tsOrNeg(b.last_contact_at);
    case 'note': return (a.last_note ?? '').localeCompare(b.last_note ?? '', 'vi');
    case 'source': return (a.source ?? '').localeCompare(b.source ?? '', 'vi');
    case 'next': return tsOrNeg(a.next_contact_at) - tsOrNeg(b.next_contact_at);
    case 'count': return a.contact_count - b.contact_count;
  }
}

interface ColDef { key: ColKey; label: string; pad: string }

const COLS: ColDef[] = [
  { key: 'time', label: 'Thời gian', pad: 'px-4' },
  { key: 'name', label: 'Khách hàng', pad: 'px-5' },
  { key: 'phone', label: 'SĐT', pad: 'px-4' },
  { key: 'showroom', label: 'Showroom', pad: 'px-4' },
  { key: 'brand', label: 'Thương hiệu', pad: 'px-4' },
  { key: 'model', label: 'Dòng xe', pad: 'px-4' },
  { key: 'assignee', label: 'Phụ trách', pad: 'px-4' },
  { key: 'contacted', label: 'Trạng thái', pad: 'px-4' },
  { key: 'class', label: 'Phân loại', pad: 'px-4' },
  { key: 'contactedAt', label: 'Liên hệ lúc', pad: 'px-4' },
  { key: 'note', label: 'Nội dung liên hệ', pad: 'px-4' },
  { key: 'source', label: 'Nguồn', pad: 'px-4' },
  { key: 'next', label: 'Hẹn gọi lại', pad: 'px-4' },
  { key: 'count', label: 'Số lần LH', pad: 'px-4' },
];

// Cột thông tin KH được đóng băng khi cuộn ngang (theo thứ tự, có width cố định)
const STICKY: ColKey[] = ['time', 'name', 'phone'];
const STICKY_W: Record<string, number> = { time: 150, name: 180, phone: 140 };

const STORAGE_KEY = 'leads.cols.v2';
const DEFAULT_HIDDEN: ColKey[] = ['contactedAt', 'source', 'next', 'count'];

const fmtDate = (v: string) => new Date(v).toLocaleString('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const fmtDay = (v: string) => new Date(v).toLocaleDateString('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

const uniqSorted = (arr: (string | null)[]) =>
  [...new Set(arr.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'vi'));

function Filter({ value, onChange, placeholder, options }: {
  value: string; onChange: (v: string) => void; placeholder: string; options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-[#004B9B] outline-none text-slate-600"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function LeadsTable({ leads, models }: { leads: LeadRow[]; models: ModelOption[] }) {
  const [tab, setTab] = useState<Tab>('all');
  const [sortKey, setSortKey] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState<Set<ColKey>>(new Set(DEFAULT_HIDDEN));
  const [colMenu, setColMenu] = useState(false);
  const [openLead, setOpenLead] = useState<LeadRow | null>(null);

  const [fShowroom, setFShowroom] = useState('');
  const [fBrand, setFBrand] = useState('');
  const [fModel, setFModel] = useState('');

  // Khôi phục cấu hình cột hiển thị
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw) as ColKey[]));
    } catch { /* ignore */ }
  }, []);

  const toggleCol = (key: ColKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const visibleCols = COLS.filter((c) => !hidden.has(c.key));

  // Tính offset trái cho các cột đóng băng (chỉ những cột đang hiện)
  const leftMap: Partial<Record<ColKey, number>> = {};
  let acc = 0;
  for (const c of visibleCols) {
    if (STICKY.includes(c.key)) { leftMap[c.key] = acc; acc += STICKY_W[c.key]; }
  }
  const stickyStyle = (key: ColKey, header: boolean): React.CSSProperties => {
    if (leftMap[key] === undefined) return {};
    const isLast = STICKY.filter((k) => leftMap[k] !== undefined).slice(-1)[0] === key;
    return {
      position: 'sticky',
      left: leftMap[key],
      width: STICKY_W[key],
      minWidth: STICKY_W[key],
      zIndex: header ? 20 : 1,
      background: header ? '#f8fafc' : '#fff',
      boxShadow: isLast ? '2px 0 4px -2px rgba(0,0,0,0.08)' : undefined,
    };
  };

  const counts = {
    all: leads.length,
    pending: leads.filter((l) => !isContacted(l.last_contact_at)).length,
    contacted: leads.filter((l) => isContacted(l.last_contact_at)).length,
  };

  const showroomOpts = useMemo(() => uniqSorted(leads.map((l) => l.showroom_name)), [leads]);
  const brandOpts = useMemo(() => uniqSorted(leads.map((l) => l.brand_name)), [leads]);
  const modelOpts = useMemo(
    () => uniqSorted(leads.filter((l) => !fBrand || l.brand_name === fBrand).map((l) => l.model_name)),
    [leads, fBrand],
  );

  const rows = useMemo(() => {
    const filtered = leads.filter((l) => {
      if (tab === 'contacted' && !isContacted(l.last_contact_at)) return false;
      if (tab === 'pending' && isContacted(l.last_contact_at)) return false;
      if (fShowroom && l.showroom_name !== fShowroom) return false;
      if (fBrand && l.brand_name !== fBrand) return false;
      if (fModel && l.model_name !== fModel) return false;
      return true;
    });
    if (!sortKey) return filtered;
    const sorted = [...filtered].sort((a, b) => compare(sortKey, a, b));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [leads, tab, sortKey, sortDir, fShowroom, fBrand, fModel]);

  const onSort = (key: ColKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'pending', label: 'Chưa liên hệ' },
    { key: 'contacted', label: 'Đã liên hệ' },
  ];

  const renderCell = (key: ColKey, l: LeadRow) => {
    const contacted = isContacted(l.last_contact_at);
    switch (key) {
      case 'time': return <span className="text-slate-500">{fmtDate(l.created_at)}</span>;
      case 'name': return <span className="font-medium text-slate-800">{l.full_name ?? '—'}</span>;
      case 'phone': return <span className="text-slate-600">{formatPhoneDisplay(l.phone)}</span>;
      case 'showroom': return <span className="text-slate-600">{l.showroom_name ?? '—'}</span>;
      case 'brand': return <span className="text-slate-600">{l.brand_name}</span>;
      case 'model': return <span className="text-slate-600">{l.model_name ?? '—'}</span>;
      case 'assignee': return <span className="text-slate-600">{l.assignee_name ?? '—'}</span>;
      case 'contacted':
        return contacted ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1">
            <Check size={13} /> Đã liên hệ
          </span>
        ) : (
          <button
            disabled={pending}
            onClick={(e) => { e.stopPropagation(); start(() => markContacted(l.id)); }}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#004B9B] border border-blue-200 rounded-full px-2.5 py-1 hover:bg-blue-50 disabled:opacity-50"
          >
            <PhoneCall size={12} /> Chưa liên hệ
          </button>
        );
      case 'class':
        return (
          <select
            value={l.status}
            disabled={pending || !contacted}
            title={contacted ? undefined : 'Cần đánh dấu đã liên hệ trước khi phân loại'}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); start(() => setLeadStatus(l.id, e.target.value as LeadStatus)); }}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:border-[#004B9B] outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.code} value={s.code}>{s.code}</option>
            ))}
          </select>
        );
      case 'contactedAt':
        return <span className="text-slate-500">{contacted ? fmtDate(l.last_contact_at!) : '—'}</span>;
      case 'note':
        return <span className="text-slate-500 line-clamp-1 max-w-[220px] inline-block align-bottom">{l.last_note ?? '—'}</span>;
      case 'source': return <span className="text-slate-500">{l.source ?? '—'}</span>;
      case 'next': return <span className="text-slate-500">{l.next_contact_at ? fmtDay(l.next_contact_at) : '—'}</span>;
      case 'count': return <span className="text-slate-600 tabular-nums">{l.contact_count}</span>;
    }
  };

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
              color: tab === t.key ? '#004B9B' : '#64748b',
              background: tab === t.key ? '#e6f0fa' : 'transparent',
            }}
          >
            {t.label} <span className="opacity-60">({counts[t.key]})</span>
          </button>
        ))}

        <div className="w-px h-5 bg-slate-200 mx-1" />
        <Filter value={fShowroom} onChange={setFShowroom} placeholder="Tất cả showroom" options={showroomOpts} />
        <Filter value={fBrand} onChange={(v) => { setFBrand(v); setFModel(''); }} placeholder="Tất cả thương hiệu" options={brandOpts} />
        <Filter value={fModel} onChange={setFModel} placeholder="Tất cả dòng xe" options={modelOpts} />

        <div className="ml-auto relative">
          <button
            onClick={() => setColMenu((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
          >
            <SlidersHorizontal size={14} /> Cột hiển thị
          </button>
          {colMenu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setColMenu(false)} />
              <div className="absolute right-0 mt-1 z-30 w-56 bg-white rounded-xl shadow-lg border border-slate-200 p-2 max-h-80 overflow-y-auto">
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
      </div>

      <div data-table-scroll className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide shadow-sm">
            <tr>
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
            {rows.map((l) => (
              <tr
                key={l.id}
                onClick={() => setOpenLead(l)}
                className="border-t border-slate-100 hover:bg-slate-50/60 cursor-pointer"
              >
                {visibleCols.map((c) => (
                  <td key={c.key} className={`${c.pad} py-3 whitespace-nowrap`} style={stickyStyle(c.key, false)}>
                    {renderCell(c.key, l)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={visibleCols.length} className="px-4 py-12 text-center text-slate-400">Không có lead nào.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openLead && (
        <LeadDrawer lead={openLead} models={models} onClose={() => setOpenLead(null)} />
      )}
    </div>
  );
}
