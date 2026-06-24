'use client';

import React, { useState, useMemo, useTransition } from 'react';
import { PhoneCall, Check, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/phone';
import { STATUS_OPTIONS, isContacted, type LeadStatus } from '@/lib/lead-status';
import { setLeadStatus, markContacted } from './actions';

export interface LeadRow {
  id: string;
  full_name: string | null;
  phone: string;
  source: string | null;
  status: LeadStatus;
  created_at: string;
  last_contact_at: string | null;
}

type Tab = 'all' | 'pending' | 'contacted';
type SortKey = 'name' | 'phone' | 'source' | 'contact' | 'status' | 'time';

const STATUS_ORDER: Record<string, number> = Object.fromEntries(
  STATUS_OPTIONS.map((s, i) => [s.code, i]),
);

// Thời điểm liên hệ; chưa liên hệ = -1 để cuộn lên đầu khi sort tăng dần
const contactTime = (l: LeadRow) => (l.last_contact_at ? Date.parse(l.last_contact_at) : -1);

function compare(key: SortKey, a: LeadRow, b: LeadRow): number {
  switch (key) {
    case 'name': return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'vi');
    case 'phone': return a.phone.localeCompare(b.phone);
    case 'source': return (a.source ?? '').localeCompare(b.source ?? '', 'vi');
    case 'contact': return contactTime(a) - contactTime(b);
    case 'status': return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
    case 'time': return Date.parse(a.created_at) - Date.parse(b.created_at);
  }
}

const COLS: { key: SortKey; label: string; pad: string }[] = [
  { key: 'name', label: 'Khách hàng', pad: 'px-6' },
  { key: 'phone', label: 'SĐT', pad: 'px-4' },
  { key: 'source', label: 'Nguồn', pad: 'px-4' },
  { key: 'contact', label: 'Liên hệ', pad: 'px-4' },
  { key: 'status', label: 'Phân loại', pad: 'px-4' },
  { key: 'time', label: 'Thời gian', pad: 'px-4' },
];

export default function LeadsTable({ leads }: { leads: LeadRow[] }) {
  const [tab, setTab] = useState<Tab>('all');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pending, start] = useTransition();

  const counts = {
    all: leads.length,
    pending: leads.filter((l) => !isContacted(l.last_contact_at)).length,
    contacted: leads.filter((l) => isContacted(l.last_contact_at)).length,
  };

  const rows = useMemo(() => {
    const filtered = leads.filter((l) =>
      tab === 'all' ? true : tab === 'contacted' ? isContacted(l.last_contact_at) : !isContacted(l.last_contact_at),
    );
    if (!sortKey) return filtered;
    const sorted = [...filtered].sort((a, b) => compare(sortKey, a, b));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [leads, tab, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'pending', label: 'Chưa liên hệ' },
    { key: 'contacted', label: 'Đã liên hệ' },
  ];

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 shrink-0">
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
      </div>
      <div data-table-scroll className="flex-1 min-h-0 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide shadow-sm">
          <tr>
            {COLS.map((c) => {
              const active = sortKey === c.key;
              return (
                <th key={c.key} className={`${c.pad} py-3 font-semibold`}>
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
            const contacted = isContacted(l.last_contact_at);
            return (
              <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-6 py-3 font-medium text-slate-800">{l.full_name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{formatPhoneDisplay(l.phone)}</td>
                <td className="px-4 py-3 text-slate-500">{l.source ?? '—'}</td>
                <td className="px-4 py-3">
                  {contacted ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <Check size={13} /> Đã liên hệ
                    </span>
                  ) : (
                    <button
                      disabled={pending}
                      onClick={() => start(() => markContacted(l.id))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#004B9B] border border-blue-200 rounded-full px-2.5 py-1 hover:bg-blue-50 disabled:opacity-50"
                    >
                      <PhoneCall size={12} /> Đánh dấu liên hệ
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={l.status}
                    disabled={pending}
                    onChange={(e) => start(() => setLeadStatus(l.id, e.target.value as LeadStatus))}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:border-[#004B9B] outline-none disabled:opacity-50"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.code} value={s.code}>{s.code} · {s.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(l.created_at).toLocaleString('vi-VN')}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Không có lead nào.</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
