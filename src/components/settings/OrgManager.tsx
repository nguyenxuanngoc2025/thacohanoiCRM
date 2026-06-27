'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import type { ShowroomRow, BrandRow, ModelRow, AssignStrategy } from './types';
import {
  PanelHeader, PrimaryBtn, GhostBtn, Field, TextInput, Select, FlashBar, Panel, postAdmin,
} from './ui';

// Nhãn 3 kiểu chia (dùng cho cách showroom chia lead vào các phòng).
const STRATEGY_LABELS: Record<AssignStrategy, string> = {
  least_loaded: 'Ít lead nhất',
  round_robin: 'Xoay vòng',
  weighted: 'Theo tỷ lệ %',
};

export default function OrgManager({
  showrooms, brands, models, canEditCatalog,
}: { showrooms: ShowroomRow[]; brands: BrandRow[]; models: ModelRow[]; canEditCatalog: boolean }) {
  const router = useRouter();
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };

  const [srEdit, setSrEdit] = useState<ShowroomRow | 'new' | null>(null);
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

  // Tên các thương hiệu của 1 showroom (ghi rõ, không gộp "Đa thương hiệu")
  const brandNamesOf = (ids: string[]) =>
    ids.map((id) => brands.find((b) => b.id === id)?.name).filter(Boolean) as string[];

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

      {/* Thương hiệu & dòng xe — accordion: mở thương hiệu để xem/sửa dòng xe của nó */}
      <Panel>
        <PanelHeader
          title="Thương hiệu & dòng xe"
          desc={canEditCatalog
            ? 'Mỗi thương hiệu (KIA, Mazda…) gom các dòng xe của nó. Nhấn tên thương hiệu để mở danh sách dòng xe. Lead chống trùng theo từng thương hiệu.'
            : 'Danh mục dùng chung toàn hệ thống, chỉ Chủ nền tảng được sửa. Nhấn tên thương hiệu để xem danh sách dòng xe.'}
          action={canEditCatalog ? <PrimaryBtn onClick={() => setBrandEdit('new')}>Thêm thương hiệu</PrimaryBtn> : undefined}
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
                  {canEditCatalog && (
                    <div className="ml-auto flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <TextBtn onClick={() => { setNewModelBrand(b.id); setModelEdit('new'); }}>Thêm dòng xe</TextBtn>
                      <TextBtn onClick={() => setBrandEdit(b)}>Sửa</TextBtn>
                      <TextBtn danger onClick={() => delBrand(b)}>Xoá</TextBtn>
                    </div>
                  )}
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
                        {canEditCatalog && (
                          <div className="ml-auto flex items-center gap-1.5">
                            <TextBtn onClick={() => setModelEdit(m)}>Sửa</TextBtn>
                            <TextBtn danger onClick={() => delModel(m)}>Xoá</TextBtn>
                          </div>
                        )}
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

function ShowroomModal({
  target, brands, onClose, onDone,
}: { target: ShowroomRow | 'new'; brands: BrandRow[]; onClose: () => void; onDone: (m: string) => void }) {
  const isNew = target === 'new';
  const init = isNew ? null : target;
  const [name, setName] = useState(init?.name ?? '');
  const [code, setCode] = useState(init?.code ?? '');
  const [brandIds, setBrandIds] = useState<string[]>(init?.brand_ids ?? []);
  const [teamStrategy, setTeamStrategy] = useState<AssignStrategy>(init?.team_assign_strategy ?? 'weighted');
  const [sharePct, setSharePct] = useState(String(init?.assign_share_pct ?? 0));
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
      team_assign_strategy: teamStrategy, assign_share_pct: Number(sharePct) || 0,
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
      <Field label="Cách chia lead vào các phòng" hint="Áp dụng khi showroom có nhiều phòng bán hàng.">
        <Select value={teamStrategy} onChange={(e) => setTeamStrategy(e.target.value as AssignStrategy)}>
          <option value="least_loaded">{STRATEGY_LABELS.least_loaded}</option>
          <option value="round_robin">{STRATEGY_LABELS.round_robin}</option>
          <option value="weighted">{STRATEGY_LABELS.weighted}</option>
        </Select>
      </Field>
      <Field label="Tỷ lệ nhận lead của showroom (%)" hint="Chỉ dùng khi công ty chia lead vào showroom theo tỷ lệ. Tổng các showroom nên bằng 100%.">
        <TextInput type="number" min={0} value={sharePct} onChange={(e) => setSharePct(e.target.value)} />
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
  target, brands, initialBrandId, onClose, onDone,
}: { target: ModelRow | 'new'; brands: BrandRow[]; initialBrandId?: string; onClose: () => void; onDone: (m: string) => void }) {
  const isNew = target === 'new';
  const init = isNew ? null : target;
  const [name, setName] = useState(init?.name ?? '');
  const [brandId, setBrandId] = useState(init?.brand_id ?? initialBrandId ?? '');
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
