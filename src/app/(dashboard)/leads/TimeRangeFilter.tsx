'use client';
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { RangePreset } from '@/lib/leads-query';

const OPTS: { value: RangePreset; label: string }[] = [
  { value: 'all', label: 'Tất cả thời gian' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'this_week', label: 'Tuần này' },
  { value: 'this_month', label: 'Tháng này' },
  { value: 'last_month', label: 'Tháng trước' },
  { value: '30d', label: '30 ngày' },
  { value: 'custom', label: 'Tùy chọn ngày…' },
];

export default function TimeRangeFilter({
  range, from, to, onChange,
}: {
  range: RangePreset; from: string; to: string;
  onChange: (v: { range: RangePreset; from: string; to: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = range !== 'all';
  const label = OPTS.find((o) => o.value === range)?.label ?? 'Tất cả thời gian';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-[34px] px-2.5 inline-flex items-center gap-1.5 rounded-lg border text-sm transition-colors"
        style={{
          borderColor: active ? 'var(--color-brand)' : '#e2e8f0',
          background: active ? '#e6f0fa' : '#fff',
          color: active ? 'var(--color-brand)' : '#64748b',
          fontWeight: active ? 600 : 400,
        }}
      >
        <CalendarDays size={14} /> <span className={active ? 'inline' : 'hidden sm:inline'}>{label}</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div className="absolute z-[9999] mt-1 w-48 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
            {OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { if (o.value !== 'custom') setOpen(false); onChange({ range: o.value, from, to }); }}
                className={`block w-full text-left px-2 py-1.5 rounded text-sm hover:bg-slate-50 ${o.value === range ? 'font-semibold text-slate-900' : 'text-slate-600'}`}
              >
                {o.label}
              </button>
            ))}
            {range === 'custom' && (
              <div className="border-t border-slate-100 mt-1 pt-2 px-1 space-y-1">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => onChange({ range: 'custom', from: e.target.value, to })}
                  className="w-full border border-slate-200 rounded px-2 py-1 text-sm"
                />
                <input
                  type="date"
                  value={to}
                  onChange={(e) => onChange({ range: 'custom', from, to: e.target.value })}
                  className="w-full border border-slate-200 rounded px-2 py-1 text-sm"
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
