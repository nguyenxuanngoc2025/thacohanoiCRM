'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Lock, X } from 'lucide-react';
import {
  PanelHeader, PrimaryBtn, GhostBtn, Field, TextInput, FlashBar, Panel, postAdmin,
} from '@/components/settings/ui';
import { useDialogs } from '@/components/ui/dialogs';
import type { SourceChannelRow } from '@/lib/source-catalog';

type Row = SourceChannelRow & { id: string };

// Quản lý danh mục NGUỒN & CHI TIẾT KÊNH lead — dùng chung mọi công ty, chỉ Chủ nền tảng.
// Kênh hệ thống (is_builtin) khoá mã (value) + không xoá; kênh tự thêm sửa/xoá thoải mái.
export default function LeadSourceManager({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const { confirm, alert, dialog } = useDialogs();
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Row | { platform_key: string; platform_name: string } | 'new-platform' | null>(null);

  const toggle = (k: string) => setExpanded((prev) => {
    const s = new Set(prev);
    if (s.has(k)) s.delete(k); else s.add(k);
    return s;
  });

  // Gộp theo Nguồn (platform_key), giữ thứ tự sort_order.
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; name: string; items: Row[] }>();
    for (const r of [...rows].sort((a, b) => a.sort_order - b.sort_order)) {
      const g = m.get(r.platform_key) ?? { key: r.platform_key, name: r.platform_name, items: [] };
      g.items.push(r); m.set(r.platform_key, g);
    }
    return [...m.values()];
  }, [rows]);

  const del = async (r: Row) => {
    if (!(await confirm({ title: 'Xoá chi tiết kênh', message: `Xoá "${r.label}"?`, danger: true, confirmText: 'Xoá' }))) return;
    const res = await postAdmin('/api/admin/lead-sources', { op: 'delete', id: r.id });
    if (!res.ok) { await alert({ title: 'Không xoá được', message: res.error }); return; }
    flashMsg(`Đã xoá "${r.label}".`); router.refresh();
  };

  return (
    <div className="space-y-5">
      {dialog}
      <FlashBar msg={flash} />
      <Panel>
        <PanelHeader
          title="Nguồn & chi tiết kênh"
          desc="Mỗi Nguồn (Facebook, Website…) gom các chi tiết kênh (Lead Ads, Tin nhắn, Tool…). Nhấn tên Nguồn để mở. Kênh hệ thống khoá mã và không xoá, chỉ sửa tên hiển thị / ẩn hiện."
          action={<PrimaryBtn onClick={() => setEdit('new-platform')}>Thêm nguồn</PrimaryBtn>}
        />
        <div className="space-y-2">
          {groups.map((g) => {
            const isOpen = expanded.has(g.key);
            return (
              <div key={g.key} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-50 cursor-pointer select-none" onClick={() => toggle(g.key)}>
                  {isOpen ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                  <span className="font-semibold text-slate-800">{g.name}</span>
                  <span className="text-xs text-slate-400">{g.items.length} chi tiết kênh</span>
                  <div className="ml-auto flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <TextBtn onClick={() => setEdit({ platform_key: g.key, platform_name: g.name })}>Thêm chi tiết kênh</TextBtn>
                  </div>
                </div>
                {isOpen && (
                  <div className="divide-y divide-slate-100">
                    {g.items.map((r) => (
                      <div key={r.id} className="flex items-center gap-2.5 px-3.5 py-2 pl-10" style={{ opacity: r.is_active ? 1 : 0.5 }}>
                        <span className="text-sm font-medium text-slate-700">{r.label}</span>
                        {r.is_builtin && <Lock size={12} className="text-slate-400" />}
                        {!r.is_active && <span className="text-[10px] text-slate-400">(ẩn)</span>}
                        {r.is_builtin && <span className="text-[10px] text-slate-400">kênh hệ thống — không xoá/không đổi mã</span>}
                        <div className="ml-auto flex items-center gap-1.5">
                          <TextBtn onClick={() => setEdit(r)}>Sửa</TextBtn>
                          {!r.is_builtin && <TextBtn danger onClick={() => del(r)}>Xoá</TextBtn>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {groups.length === 0 && <p className="text-sm text-slate-400">Chưa có nguồn nào.</p>}
        </div>
      </Panel>

      {edit && (
        <EditModal target={edit}
          onClose={() => setEdit(null)}
          onDone={(m) => { setEdit(null); flashMsg(m); router.refresh(); }} />
      )}
    </div>
  );
}

function TextBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className="text-xs font-medium px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
      style={{ color: danger ? '#e11d48' : 'var(--color-brand)' }}>
      {children}
    </button>
  );
}

function EditModal({
  target, onClose, onDone,
}: {
  target: Row | { platform_key: string; platform_name: string } | 'new-platform';
  onClose: () => void; onDone: (m: string) => void;
}) {
  const isRow = typeof target === 'object' && 'id' in target;
  const isNewPlatform = target === 'new-platform';
  const existing = isRow ? (target as Row) : null;
  const builtin = existing?.is_builtin ?? false;

  const [platformName, setPlatformName] = useState(
    isNewPlatform ? '' : (isRow ? (target as Row).platform_name : (target as { platform_name: string }).platform_name),
  );
  const [label, setLabel] = useState(existing?.label ?? '');
  const [value, setValue] = useState(existing?.value ?? '');
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = isNewPlatform
    ? 'Thêm nguồn mới'
    : existing ? 'Sửa chi tiết kênh' : `Thêm chi tiết kênh — ${(target as { platform_name: string }).platform_name}`;

  const submit = async () => {
    setError(null);
    if (!platformName.trim()) { setError('Nhập tên Nguồn.'); return; }
    if (!label.trim()) { setError('Nhập tên chi tiết kênh.'); return; }
    setBusy(true);
    const platformKey = isNewPlatform
      ? slugClient(platformName)
      : (isRow ? (target as Row).platform_key : (target as { platform_key: string }).platform_key);
    const payload = existing
      ? { op: 'update', id: existing.id, platform_key: platformKey, platform_name: platformName.trim(), label: label.trim(), value: builtin ? undefined : value.trim(), is_active: isActive }
      : { op: 'create', platform_key: platformKey, platform_name: platformName.trim(), label: label.trim(), value: value.trim() || undefined, is_active: isActive };
    const res = await postAdmin('/api/admin/lead-sources', payload);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? null); return; }
    onDone(existing ? `Đã cập nhật "${label.trim()}".` : `Đã thêm "${label.trim()}".`);
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Tên Nguồn" hint={existing && !builtin ? 'Đổi tên áp cho mọi chi tiết kênh cùng Nguồn.' : undefined}>
            <TextInput value={platformName} onChange={(e) => setPlatformName(e.target.value)} placeholder="Facebook" />
          </Field>
          <Field label="Tên chi tiết kênh"><TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Tool" /></Field>
          {!builtin && (
            <Field label="Mã kênh (value) — để trống = tự tạo" hint="Lưu vào leads.source. Không dấu cách. VD: fb_tool.">
              <TextInput value={value} onChange={(e) => setValue(e.target.value)} placeholder="fb_tool" />
            </Field>
          )}
          {builtin && <p className="text-xs text-slate-400">Kênh hệ thống: chỉ sửa tên hiển thị và ẩn/hiện, không đổi mã.</p>}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-brand" />
            Đang bật (hiện trong form thêm lead)
          </label>
          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <GhostBtn onClick={onClose} disabled={busy}>Hủy</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

function slugClient(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
