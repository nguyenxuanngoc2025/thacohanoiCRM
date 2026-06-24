'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Tag, Car, Plus, Edit2, Trash2, X } from 'lucide-react';
import type { ShowroomRow, BrandRow, ModelRow } from './types';
import {
  PanelHeader, PrimaryBtn, GhostBtn, Field, TextInput, Select, FlashBar, Panel, postAdmin,
} from './ui';

export default function OrgManager({
  showrooms, brands, models,
}: { showrooms: ShowroomRow[]; brands: BrandRow[]; models: ModelRow[] }) {
  const router = useRouter();
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };

  const [srEdit, setSrEdit] = useState<ShowroomRow | 'new' | null>(null);
  const [brandEdit, setBrandEdit] = useState<BrandRow | 'new' | null>(null);
  const [modelEdit, setModelEdit] = useState<ModelRow | 'new' | null>(null);

  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name ?? '—';

  const delModel = async (m: ModelRow) => {
    if (!window.confirm(`Xoá dòng xe "${m.name}"?`)) return;
    const r = await postAdmin('/api/admin/models', { op: 'delete', id: m.id });
    if (!r.ok) { window.alert(r.error); return; }
    flashMsg(`Đã xoá dòng xe "${m.name}".`); router.refresh();
  };

  const delShowroom = async (s: ShowroomRow) => {
    if (!window.confirm(`Xoá showroom "${s.name}"? (lead/đăng ký kênh liên quan có thể bị ràng buộc)`)) return;
    const r = await postAdmin('/api/admin/showrooms', { op: 'delete', id: s.id });
    if (!r.ok) { window.alert(r.error); return; }
    flashMsg(`Đã xoá showroom "${s.name}".`); router.refresh();
  };
  const delBrand = async (b: BrandRow) => {
    if (!window.confirm(`Xoá thương hiệu "${b.name}"?`)) return;
    const r = await postAdmin('/api/admin/brands', { op: 'delete', id: b.id });
    if (!r.ok) { window.alert(r.error); return; }
    flashMsg(`Đã xoá thương hiệu "${b.name}".`); router.refresh();
  };

  return (
    <div className="space-y-4">
      <FlashBar msg={flash} />

      {/* Showrooms */}
      <Panel>
        <PanelHeader
          title="Showroom"
          desc="Mỗi showroom thuộc 1 thương hiệu. Dùng để gán nhân sự, đăng ký kênh và phân giao lead."
          action={<PrimaryBtn onClick={() => setSrEdit('new')}><Plus size={15} /> Thêm showroom</PrimaryBtn>}
        />
        <div className="overflow-hidden rounded-lg border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Tên showroom</th>
                <th className="px-4 py-2.5 font-semibold">Mã</th>
                <th className="px-4 py-2.5 font-semibold">Thương hiệu</th>
                <th className="px-4 py-2.5 font-semibold text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {showrooms.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-800 flex items-center gap-2">
                    <Building2 size={14} style={{ color: '#004B9B' }} /> {s.name}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{s.code ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{brandName(s.brand_id)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <IconBtn title="Sửa" onClick={() => setSrEdit(s)}><Edit2 size={14} style={{ color: '#004B9B' }} /></IconBtn>
                      <IconBtn title="Xoá" onClick={() => delShowroom(s)}><Trash2 size={14} className="text-rose-600" /></IconBtn>
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

      {/* Brands */}
      <Panel>
        <PanelHeader
          title="Thương hiệu"
          desc="Danh mục thương hiệu (KIA, Mazda…). Lead chống trùng theo từng thương hiệu."
          action={<PrimaryBtn onClick={() => setBrandEdit('new')}><Plus size={15} /> Thêm thương hiệu</PrimaryBtn>}
        />
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {brands.map((b) => (
            <div key={b.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Tag size={14} style={{ color: '#004B9B' }} />
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">{b.name}</div>
                  <div className="font-mono text-[10px] text-slate-400">{b.slug}</div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <IconBtn title="Sửa" onClick={() => setBrandEdit(b)}><Edit2 size={13} style={{ color: '#004B9B' }} /></IconBtn>
                <IconBtn title="Xoá" onClick={() => delBrand(b)}><Trash2 size={13} className="text-rose-600" /></IconBtn>
              </div>
            </div>
          ))}
          {brands.length === 0 && <p className="text-sm text-slate-400">Chưa có thương hiệu.</p>}
        </div>
      </Panel>

      {/* Models (dòng xe) */}
      <Panel>
        <PanelHeader
          title="Dòng xe"
          desc="Danh mục dòng xe theo thương hiệu (Carnival, CX-5…). Dùng cho cột “Dòng xe quan tâm” khi cập nhật lead."
          action={<PrimaryBtn onClick={() => setModelEdit('new')}><Plus size={15} /> Thêm dòng xe</PrimaryBtn>}
        />
        {brands.map((b) => {
          const list = models.filter((m) => m.brand_id === b.id).sort((x, y) => x.sort_order - y.sort_order);
          if (list.length === 0) return null;
          return (
            <div key={b.id} className="mb-3 last:mb-0">
              <div className="text-xs font-semibold text-slate-500 mb-1.5">{b.name}</div>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {list.map((m) => (
                  <div key={m.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2"
                    style={{ opacity: m.is_active ? 1 : 0.5 }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Car size={14} style={{ color: '#004B9B' }} />
                      <span className="font-medium text-slate-800 truncate">{m.name}</span>
                      {!m.is_active && <span className="text-[10px] text-slate-400">(ẩn)</span>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <IconBtn title="Sửa" onClick={() => setModelEdit(m)}><Edit2 size={13} style={{ color: '#004B9B' }} /></IconBtn>
                      <IconBtn title="Xoá" onClick={() => delModel(m)}><Trash2 size={13} className="text-rose-600" /></IconBtn>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {models.length === 0 && <p className="text-sm text-slate-400">Chưa có dòng xe.</p>}
      </Panel>

      {srEdit && (
        <ShowroomModal target={srEdit} brands={brands}
          onClose={() => setSrEdit(null)}
          onDone={(m) => { setSrEdit(null); flashMsg(m); router.refresh(); }} />
      )}
      {brandEdit && (
        <BrandModal target={brandEdit}
          onClose={() => setBrandEdit(null)}
          onDone={(m) => { setBrandEdit(null); flashMsg(m); router.refresh(); }} />
      )}
      {modelEdit && (
        <ModelModal target={modelEdit} brands={brands}
          onClose={() => setModelEdit(null)}
          onDone={(m) => { setModelEdit(null); flashMsg(m); router.refresh(); }} />
      )}
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick}
      className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50 transition-colors">
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
  const [brandId, setBrandId] = useState(init?.brand_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError('Nhập tên showroom.'); return; }
    if (!brandId) { setError('Chọn thương hiệu.'); return; }
    setBusy(true);
    const r = await postAdmin('/api/admin/showrooms', {
      op: isNew ? 'create' : 'update',
      id: isNew ? undefined : (target as ShowroomRow).id,
      name: name.trim(), code: code.trim() || null, brand_id: brandId,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? null); return; }
    onDone(isNew ? `Đã thêm showroom "${name.trim()}".` : `Đã cập nhật "${name.trim()}".`);
  };

  return (
    <ModalShell title={isNew ? 'Thêm showroom' : 'Sửa showroom'} onClose={onClose} onSubmit={submit} busy={busy} error={error}>
      <Field label="Tên showroom"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="KIA Hà Nội" /></Field>
      <Field label="Mã (tuỳ chọn)"><TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="KIA-HN-01" /></Field>
      <Field label="Thương hiệu">
        <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="">— Chọn thương hiệu —</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </Field>
    </ModalShell>
  );
}

function BrandModal({ target, onClose, onDone }: { target: BrandRow | 'new'; onClose: () => void; onDone: (m: string) => void }) {
  const isNew = target === 'new';
  const init = isNew ? null : target;
  const [name, setName] = useState(init?.name ?? '');
  const [slug, setSlug] = useState(init?.slug ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError('Nhập tên thương hiệu.'); return; }
    setBusy(true);
    const r = await postAdmin('/api/admin/brands', {
      op: isNew ? 'create' : 'update',
      id: isNew ? undefined : (target as BrandRow).id,
      name: name.trim(), slug: slug.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? null); return; }
    onDone(isNew ? `Đã thêm thương hiệu "${name.trim()}".` : `Đã cập nhật "${name.trim()}".`);
  };

  return (
    <ModalShell title={isNew ? 'Thêm thương hiệu' : 'Sửa thương hiệu'} onClose={onClose} onSubmit={submit} busy={busy} error={error}>
      <Field label="Tên thương hiệu"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="KIA" /></Field>
      <Field label="Slug (để trống = tự tạo)" hint="Dùng trong dữ liệu, không dấu cách. VD: kia, mazda.">
        <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="kia" />
      </Field>
    </ModalShell>
  );
}

function ModelModal({
  target, brands, onClose, onDone,
}: { target: ModelRow | 'new'; brands: BrandRow[]; onClose: () => void; onDone: (m: string) => void }) {
  const isNew = target === 'new';
  const init = isNew ? null : target;
  const [name, setName] = useState(init?.name ?? '');
  const [brandId, setBrandId] = useState(init?.brand_id ?? '');
  const [sortOrder, setSortOrder] = useState(String(init?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(init?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError('Nhập tên dòng xe.'); return; }
    if (!brandId) { setError('Chọn thương hiệu.'); return; }
    setBusy(true);
    const r = await postAdmin('/api/admin/models', {
      op: isNew ? 'create' : 'update',
      id: isNew ? undefined : (target as ModelRow).id,
      name: name.trim(), brand_id: brandId,
      sort_order: Number(sortOrder) || 0, is_active: isActive,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? null); return; }
    onDone(isNew ? `Đã thêm dòng xe "${name.trim()}".` : `Đã cập nhật "${name.trim()}".`);
  };

  return (
    <ModalShell title={isNew ? 'Thêm dòng xe' : 'Sửa dòng xe'} onClose={onClose} onSubmit={submit} busy={busy} error={error}>
      <Field label="Thương hiệu">
        <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="">— Chọn thương hiệu —</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </Field>
      <Field label="Tên dòng xe"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="New Carnival" /></Field>
      <Field label="Thứ tự hiển thị" hint="Số nhỏ hiển thị trước.">
        <TextInput value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} placeholder="0" inputMode="numeric" />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-[#004B9B]" />
        Đang kinh doanh (hiện trong danh sách chọn)
      </label>
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
