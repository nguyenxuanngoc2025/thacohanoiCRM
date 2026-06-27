'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import type { ShowroomRow, BrandRow } from './types';
import {
  PanelHeader, PrimaryBtn, GhostBtn, Field, TextInput, FlashBar, Panel, postAdmin,
} from './ui';

export default function OrgManager({
  showrooms, brands,
}: { showrooms: ShowroomRow[]; brands: BrandRow[] }) {
  const router = useRouter();
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };

  const [srEdit, setSrEdit] = useState<ShowroomRow | 'new' | null>(null);

  // Tên các thương hiệu của 1 showroom (ghi rõ, không gộp "Đa thương hiệu")
  const brandNamesOf = (ids: string[]) =>
    ids.map((id) => brands.find((b) => b.id === id)?.name).filter(Boolean) as string[];

  const delShowroom = async (s: ShowroomRow) => {
    if (!window.confirm(`Xoá showroom "${s.name}"? (lead/đăng ký kênh liên quan có thể bị ràng buộc)`)) return;
    const r = await postAdmin('/api/admin/showrooms', { op: 'delete', id: s.id });
    if (!r.ok) { window.alert(r.error); return; }
    flashMsg(`Đã xoá showroom "${s.name}".`); router.refresh();
  };

  return (
    <div className="space-y-5">
      <FlashBar msg={flash} />

      {/* Showroom (địa điểm) */}
      <Panel>
        <PanelHeader
          title="Showroom (địa điểm)"
          desc="Mỗi showroom là một địa điểm (Giải Phóng, Chương Mỹ…) và có thể bán nhiều thương hiệu. Dùng để gán nhân sự, đăng ký kênh và phân giao lead."
          action={<PrimaryBtn onClick={() => setSrEdit('new')}>Thêm showroom</PrimaryBtn>}
        />
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Tên showroom</th>
                <th className="px-4 py-2.5 font-semibold">Mã</th>
                <th className="px-4 py-2.5 font-semibold">Thương hiệu</th>
                <th className="px-4 py-2.5 font-semibold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {showrooms.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{s.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{s.code ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {brandNamesOf(s.brand_ids).length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {brandNamesOf(s.brand_ids).map((n) => (
                          <span key={n} className="inline-block text-xs font-medium rounded-md px-2 py-0.5"
                            style={{ background: '#e6f0fa', color: '#004B9B' }}>{n}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <TextBtn onClick={() => setSrEdit(s)}>Sửa</TextBtn>
                      <TextBtn danger onClick={() => delShowroom(s)}>Xoá</TextBtn>
                    </div>
                  </td>
                </tr>
              ))}
              {showrooms.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Chưa có showroom.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {srEdit && (
        <ShowroomModal target={srEdit} brands={brands}
          onClose={() => setSrEdit(null)}
          onDone={(m) => { setSrEdit(null); flashMsg(m); router.refresh(); }} />
      )}
    </div>
  );
}

function TextBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-medium px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
      style={{ color: danger ? '#e11d48' : '#004B9B' }}
    >
      {children}
    </button>
  );
}

function ShowroomModal({
  target, brands, onClose, onDone,
}: { target: ShowroomRow | 'new'; brands: BrandRow[]; onClose: () => void; onDone: (m: string) => void }) {
  const isNew = target === 'new';
  const init = isNew ? null : target;
  const [name, setName] = useState(init?.name ?? '');
  const [code, setCode] = useState(init?.code ?? '');
  const [brandIds, setBrandIds] = useState<string[]>(init?.brand_ids ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleBrand = (id: string) =>
    setBrandIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError('Nhập tên showroom.'); return; }
    setBusy(true);
    const r = await postAdmin('/api/admin/showrooms', {
      op: isNew ? 'create' : 'update',
      id: isNew ? undefined : (target as ShowroomRow).id,
      name: name.trim(), code: code.trim() || null, brand_ids: brandIds,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? null); return; }
    onDone(isNew ? `Đã thêm showroom "${name.trim()}".` : `Đã cập nhật "${name.trim()}".`);
  };

  return (
    <ModalShell title={isNew ? 'Thêm showroom' : 'Sửa showroom'} onClose={onClose} onSubmit={submit} busy={busy} error={error}>
      <Field label="Tên showroom"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Giải Phóng" /></Field>
      <Field label="Mã (tuỳ chọn)"><TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="GP" /></Field>
      <Field label="Thương hiệu kinh doanh" hint="Tick các thương hiệu showroom này bán. Có thể chọn nhiều.">
        <div className="space-y-1.5">
          {brands.map((b) => {
            const checked = brandIds.includes(b.id);
            return (
              <label key={b.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors"
                style={{
                  borderColor: checked ? '#004B9B' : '#e2e8f0',
                  background: checked ? '#e6f0fa' : '#fff',
                }}>
                <input type="checkbox" checked={checked} onChange={() => toggleBrand(b.id)} className="accent-[#004B9B]" />
                <span className="text-sm font-medium text-slate-700">{b.name}</span>
              </label>
            );
          })}
          {brands.length === 0 && <p className="text-sm text-slate-400">Chưa có thương hiệu nào.</p>}
        </div>
      </Field>
    </ModalShell>
  );
}

function ModalShell({
  title, onClose, onSubmit, busy, error, children,
}: {
  title: string; onClose: () => void; onSubmit: () => void; busy: boolean;
  error: string | null; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {children}
          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <GhostBtn onClick={onClose} disabled={busy}>Hủy</GhostBtn>
          <PrimaryBtn onClick={onSubmit} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}
