'use client';

import React, { useState, useTransition } from 'react';
import { PhoneCall, Check } from 'lucide-react';
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

export default function LeadsTable({ leads }: { leads: LeadRow[] }) {
  const [tab, setTab] = useState<Tab>('all');
  const [pending, start] = useTransition();

  const counts = {
    all: leads.length,
    pending: leads.filter((l) => !isContacted(l.last_contact_at)).length,
    contacted: leads.filter((l) => isContacted(l.last_contact_at)).length,
  };

  const shown = leads.filter((l) =>
    tab === 'all' ? true : tab === 'contacted' ? isContacted(l.last_contact_at) : !isContacted(l.last_contact_at),
  );

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'pending', label: 'Chưa liên hệ' },
    { key: 'contacted', label: 'Đã liên hệ' },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100">
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
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
          <tr>
            <th className="px-6 py-3 font-semibold">Khách hàng</th>
            <th className="px-4 py-3 font-semibold">SĐT</th>
            <th className="px-4 py-3 font-semibold">Nguồn</th>
            <th className="px-4 py-3 font-semibold">Liên hệ</th>
            <th className="px-4 py-3 font-semibold">Phân loại</th>
            <th className="px-4 py-3 font-semibold">Thời gian</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((l) => {
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
          {shown.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Không có lead nào.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
