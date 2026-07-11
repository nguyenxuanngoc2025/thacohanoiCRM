'use client';

import React, { useState, useRef } from 'react';
import { ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';

export const BRAND = '#004B9B';
/** Bảng màu chủ đạo cho biểu đồ (đồng bộ tông xanh thương hiệu + bổ trợ). */
export const PALETTE = ['#004B9B', '#1d4ed8', '#0891b2', '#0d9488', '#b45309', '#be123c', '#7c3aed', '#64748b'];
export const fmt = (n: number) => n.toLocaleString('vi-VN');

export interface Opt { value: string; label: string }

export function Panel({ title, desc, action, children, fill }: {
  title?: string; desc?: string; action?: React.ReactNode; children: React.ReactNode; fill?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5${fill ? ' h-full flex flex-col' : ''}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-bold text-slate-800">{title}</h2>}
            {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
          </div>
          {action}
        </div>
      )}
      {fill ? <div className="flex-1 flex flex-col justify-center min-h-0">{children}</div> : children}
    </div>
  );
}

/** Dropdown popup — đồng bộ style filter của trang Lead. */
export function Dropdown({ value, onChange, placeholder, options, allowClear = true }: {
  value: string; onChange: (v: string) => void; placeholder: string; options: Opt[]; allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
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
      <button ref={btnRef} onClick={toggle}
        className="inline-flex items-center justify-between gap-1.5 text-sm border rounded-lg px-2.5 py-1.5 outline-none transition-colors min-w-[150px]"
        style={{
          borderColor: active ? BRAND : '#e2e8f0',
          background: active ? '#e6f0fa' : '#fff',
          color: active ? BRAND : '#64748b',
          fontWeight: active ? 600 : 400,
        }}>
        <span className="truncate">{active ? (current?.label ?? value) : placeholder}</span>
        <ChevronDown size={13} className="opacity-60 shrink-0" />
      </button>
      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, maxHeight: 280, overflowY: 'auto',
          }}>
            {allowClear && (
              <button onClick={() => pick('')}
                className="block w-full text-left text-sm rounded-md px-2.5 py-1.5 hover:bg-slate-50"
                style={{ color: !active ? BRAND : '#475569', fontWeight: !active ? 600 : 400 }}>
                {placeholder}
              </button>
            )}
            {options.map((o) => (
              <button key={o.value} onClick={() => pick(o.value)}
                className="block w-full text-left text-sm rounded-md px-2.5 py-1.5 hover:bg-slate-50"
                style={{ color: value === o.value ? BRAND : '#475569', fontWeight: value === o.value ? 600 : 400 }}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export function uniqOpts<T>(items: T[], pick: (l: T) => [string | null, string | null]): Opt[] {
  const map = new Map<string, string>();
  for (const l of items) {
    const [v, lbl] = pick(l);
    if (v == null) continue;
    if (!map.has(v)) map.set(v, lbl ?? v);
  }
  return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

export function DeltaArrow({ delta, positiveIsGood = true, pct = false }: { delta: number; positiveIsGood?: boolean; pct?: boolean }) {
  if (Math.abs(delta) < (pct ? 0.05 : 0.5)) {
    return <span className="text-[11px] text-slate-300">—</span>;
  }
  const up = delta > 0;
  const good = up === positiveIsGood;
  const color = good ? '#047857' : '#be123c';
  const val = pct ? `${Math.abs(delta).toFixed(1)}%` : fmt(Math.abs(delta));
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color }}>
      {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{val}
    </span>
  );
}

export function OverdueCallout({ count, detail, actionLabel, onJump }: { count: number; detail?: string; actionLabel?: string; onJump?: () => void }) {
  if (count <= 0) return null;
  return (
    <div className="rounded-xl border p-3 sm:p-4 flex items-center justify-between gap-3" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
      <div className="text-sm">
        <span className="font-bold" style={{ color: '#be123c' }}>{fmt(count)}</span>{' '}
        <span className="text-slate-700">lead quá hạn chăm sóc</span>
        {detail && <span className="text-slate-500"> — {detail}</span>}
      </div>
      {actionLabel && onJump && (
        <button onClick={onJump} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white shrink-0" style={{ background: '#be123c' }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
