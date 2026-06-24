'use client';

import React from 'react';
import { Check } from 'lucide-react';

const NAVY = '#004B9B';

export function PanelHeader({
  title, desc, action,
}: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {desc && <p className="text-xs text-slate-400 mt-0.5 leading-snug max-w-xl">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function PrimaryBtn({
  children, onClick, disabled, type = 'button',
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-white rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60"
      style={{ background: 'linear-gradient(135deg, #004B9B, #0468BF)' }}
    >
      {children}
    </button>
  );
}

export function GhostBtn({
  children, onClick, disabled,
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#004B9B] ${props.className ?? ''}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#004B9B] bg-white ${props.className ?? ''}`}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2"
    >
      <span
        className="relative inline-block w-9 h-5 rounded-full transition-colors"
        style={{ background: checked ? NAVY : '#cbd5e1' }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform"
          style={{ transform: checked ? 'translateX(16px)' : 'none' }}
        />
      </span>
      {label && <span className="text-sm text-slate-600">{label}</span>}
    </button>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-block text-[11px] font-medium rounded-full px-2 py-0.5 ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      {active ? 'Hoạt động' : 'Tạm dừng'}
    </span>
  );
}

export function FlashBar({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="px-4 py-2.5 text-sm bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg flex items-center gap-2">
      <Check size={14} /> {msg}
    </div>
  );
}

export function Panel({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">{children}</div>;
}

// POST helper dùng chung cho mọi API admin cấu hình
export async function postAdmin(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? 'Thao tác thất bại.' };
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, error: 'Lỗi kết nối máy chủ.' };
  }
}
