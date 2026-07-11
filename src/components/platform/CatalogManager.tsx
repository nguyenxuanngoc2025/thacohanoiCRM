'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import type { BrandRow, ModelRow } from '@/components/settings/types';
import {
  PanelHeader, PrimaryBtn, GhostBtn, Field, TextInput, Select, FlashBar, Panel, postAdmin,
} from '@/components/settings/ui';
import { useDialogs } from '@/components/ui/dialogs';

// Quản lý danh mục THƯƠNG HIỆU & DÒNG XE — danh mục dùng chung mọi công ty,
// chỉ Chủ nền tảng (platform_owner) được sửa. Đặt tại trang /admin (nền tảng).
export default function CatalogManager({ brands, models }: { brands: BrandRow[]; models: ModelRow[] }) {
  const router = useRouter();
  const { confirm, alert, dialog } = useDialogs();
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };

  const [brandEdit, setBrandEdit] = useState<BrandRow | 'new' | null>(null);
  const [modelEdit, setModelEdit] = useState<ModelRow | 'new' | null>(null);
  const [newModelBrand, setNewModelBrand] = useState<string>('');

  // Thương hiệu nào đang mở (xổ danh sách dòng xe)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const delModel = async (m: ModelRow) => {
    if (!(await confirm({ title: 'Xoá dòng xe', message: `Xoá dòng xe "${m.name}"?`, danger: true, confirmText: 'Xoá' }))) return;
    const r = await postAdmin('/api/admin/models', { op: 'delete', id: m.id });
    if (!r.ok) { await alert({ title: 'Không xoá được', message: r.error }); return; }
    flashMsg(`Đã xoá dòng xe "${m.name}".`); router.refresh();
  };
  const delBrand = async (b: BrandRow) => {
    if (!(await confirm({ title: 'Xoá thương hiệu', message: `Xoá thương hiệu "${b.name}"?`, danger: true, confirmText: 'Xoá' }))) return;
    const r = await postAdmin('/api/admin/brands', { op: 'delete', id: b.id });
    if (!r.ok) { await alert({ title: 'Không xoá được', message: r.error }); return; }
    flashMsg(`Đã xoá thương hiệu "${b.name}".`); router.refresh();
  };

  return (
    <div className="space-y-5">
      {dialog}
      <FlashBar msg={flash} />

      <Panel>
        <PanelHeader
          title="Thương hiệu & dòng xe"
          desc="Mỗi thương hiệu (KIA, Mazda…) gom các dòng xe của nó. Nhấn tên thương hiệu để mở danh sách dòng xe. Danh mục dùng chung toàn hệ thống — chỉ Chủ nền tảng được sửa. Lead chống trùng theo từng thương hiệu."
          action={<PrimaryBtn onClick={() => setBrandEdit('new')}>Thêm thương hiệu</PrimaryBtn>}
        />
        <div className="space-y-2">
          {brands.map((b) => {
            const list = models.filter((m) => m.brand_id === b.id).sort((x, y) => x.sort_order - y.sort_order);
            const isOpen = expanded.has(b.id);
            return (
              <div key={b.id} className="border border-slate-200 rounded-lg overflow-hidden">
                {/* Hàng thương hiệu */}
                <div
                  className="flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-50 cursor-pointer select-none"
                  onClick={() => toggle(b.id)}
                >
                  {isOpen
                    ? <ChevronDown size={16} className="text-slate-400 shrink-0" />
                    : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                  <span className="font-semibold text-slate-800">{b.name}</span>
                  <span className="text-xs text-slate-400">{list.length} dòng xe</span>
                  <div className="ml-auto flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <TextBtn onClick={() => { setNewModelBrand(b.id); setModelEdit('new'); }}>Thêm dòng xe</TextBtn>
                    <TextBtn onClick={() => setBrandEdit(b)}>Sửa</TextBtn>
                    <TextBtn danger onClick={() => delBrand(b)}>Xoá</TextBtn>
                  </div>
                </div>

                {/* Danh sách dòng xe */}
                {isOpen && (
                  <div className="divide-y divide-slate-100">
                    {list.length === 0 ? (
                      <div className="px-3.5 py-3 pl-10 text-sm text-slate-400">Chưa có dòng xe.</div>
                    ) : list.map((m) => (
                      <div key={m.id} className="flex items-center gap-2.5 px-3.5 py-2 pl-10"
                        style={{ opacity: m.is_active ? 1 : 0.5 }}>
                        <span className="text-sm font-medium text-slate-700">{m.name}</span>
                        {!m.is_active && <span className="text-[10px] text-slate-400">(ẩn)</span>}
                        <div className="ml-auto flex items-center gap-1.5">
                          <TextBtn onClick={() => setModelEdit(m)}>Sửa</TextBtn>
                          <TextBtn danger onClick={() => delModel(m)}>Xoá</TextBtn>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {brands.length === 0 && <p className="text-sm text-slate-400">Chưa có thương hiệu.</p>}
        </div>
      </Panel>

      {brandEdit && (
        <BrandModal target={brandEdit}
          onClose={() => setBrandEdit(null)}
          onDone={(m) => { setBrandEdit(null); flashMsg(m); router.refresh(); }} />
      )}
      {modelEdit && (
        <ModelModal target={modelEdit} brands={brands} initialBrandId={newModelBrand}
          onClose={() => { setModelEdit(null); setNewModelBrand(''); }}
          onDone={(m) => { setModelEdit(null); setNewModelBrand(''); flashMsg(m); router.refresh(); }} />
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
  target, brands, initialBrandId, onClose, onDone,
}: { target: ModelRow | 'new'; brands: BrandRow[]; initialBrandId?: string; onClose: () => void; onDone: (m: string) => void }) {
  const isNew = target === 'new';
  const init = isNew ? null : target;
  const [name, setName] = useState(init?.name ?? '');
  const [brandId, setBrandId] = useState(init?.brand_id ?? initialBrandId ?? '');
  const [sortOrder, setSortOrder] = useState(String(init?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(init?.is_active ?? true);
  const [keywords, setKeywords] = useState((init?.keywords ?? []).join(', '));
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
      keywords: keywords.split(',').map((k) => k.trim()).filter((k) => k.length > 0),
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
      <Field label="Từ khoá nhận diện (phân tách dấu phẩy)" hint="Biệt danh khách hay gõ, dùng để tự dò dòng xe từ lead. Tên dòng xe đã tự khớp, không cần nhập lại. VD: so ren to, sorento may dau">
        <TextInput value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="cx5, cx 5, mazda cx5" />
      </Field>
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
