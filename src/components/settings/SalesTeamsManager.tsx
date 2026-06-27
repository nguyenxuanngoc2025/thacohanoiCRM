'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes, Plus, Edit2, Trash2, X, Check, SlidersHorizontal, Loader2 } from 'lucide-react';
import type { SalesTeamRow, ShowroomRow, BrandRow, AssignStrategy } from './types';
import type { StaffRow } from './AccountsManager';

// Nhãn 3 kiểu chia (dùng cho cách phòng chia lead tới TVBH).
const STRATEGY_LABELS: Record<AssignStrategy, string> = {
  least_loaded: 'Ít lead nhất',
  round_robin: 'Xoay vòng',
  weighted: 'Theo tỷ lệ %',
};

export default function SalesTeamsManager({
  salesTeams, showrooms, brands, staff,
}: {
  salesTeams: SalesTeamRow[];
  showrooms: ShowroomRow[];
  brands: BrandRow[];
  staff: StaffRow[];
}) {
  const router = useRouter();
  const [success, setSuccess] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<SalesTeamRow | 'new' | null>(null);
  const [allocTarget, setAllocTarget] = useState<SalesTeamRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalesTeamRow | null>(null);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3500); };

  const showroomName = (id: string) => showrooms.find((s) => s.id === id)?.name ?? '—';
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? '—';
  const headName = (id: string | null) => (id ? (staff.find((u) => u.id === id)?.full_name ?? '—') : null);

  // Nhóm phòng theo showroom để dễ nhìn.
  const grouped = useMemo(() => {
    const map = new Map<string, SalesTeamRow[]>();
    for (const t of salesTeams) {
      const arr = map.get(t.showroom_id) ?? [];
      arr.push(t);
      map.set(t.showroom_id, arr);
    }
    return Array.from(map.entries());
  }, [salesTeams]);

  const strategySummary = (t: SalesTeamRow) => {
    const kieu = STRATEGY_LABELS[t.tvbh_assign_strategy] ?? STRATEGY_LABELS.least_loaded;
    return `Chia TVBH: ${kieu} · Tỷ lệ phòng: ${t.assign_share_pct ?? 0}%`;
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes size={18} style={{ color: '#004B9B' }} />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Phòng bán hàng</h2>
            <p className="text-xs text-slate-400 mt-0.5">Lớp giữa Showroom → TVBH. Mỗi phòng chọn cách chia lead cho TVBH; tỷ lệ phòng dùng khi showroom chia theo tỷ lệ.</p>
          </div>
        </div>
        <button
          onClick={() => setEditTarget('new')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white rounded-lg px-3 py-1.5 transition-colors"
          style={{ background: 'linear-gradient(135deg, #004B9B, #0468BF)' }}
        >
          <Plus size={15} /> Thêm phòng
        </button>
      </div>

      {success && (
        <div className="px-5 py-2.5 text-sm bg-emerald-50 text-emerald-700 border-b border-emerald-100 flex items-center gap-2">
          <Check size={14} /> {success}
        </div>
      )}

      <div className="p-5 space-y-5">
        {grouped.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">Chưa có phòng bán hàng nào.</p>
        )}
        {grouped.map(([srId, teams]) => (
          <div key={srId}>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">{showroomName(srId)}</div>
            <div className="space-y-2">
              {teams.map((t) => (
                <div key={t.id} className="flex items-center gap-3 border border-slate-200 rounded-lg px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{t.name}</span>
                      <span className="text-[11px] font-semibold border rounded-full px-2 py-0.5" style={{ background: '#f5f3ff', color: '#6d28d9', borderColor: '#ddd6fe' }}>
                        {brandName(t.brand_id)}
                      </span>
                      {t.is_default && (
                        <span className="text-[11px] font-medium border rounded-full px-2 py-0.5 bg-slate-50 text-slate-500 border-slate-200">Mặc định</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Trưởng phòng: {headName(t.head_user_id) ?? <span className="italic text-slate-400">Chưa gán</span>}
                      {' · '}<span className="text-slate-600">{strategySummary(t)}</span>
                    </div>
                  </div>
                  <button title="Cách chia lead" onClick={() => setAllocTarget(t)}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50">
                    <SlidersHorizontal size={14} className="text-amber-600" />
                  </button>
                  <button title="Chỉnh sửa" onClick={() => setEditTarget(t)}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50">
                    <Edit2 size={14} style={{ color: '#004B9B' }} />
                  </button>
                  {!t.is_default && (
                    <button title="Xoá phòng" onClick={() => setDeleteTarget(t)}
                      className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50">
                      <Trash2 size={14} className="text-rose-600" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {editTarget && (
        <EditTeamModal
          target={editTarget}
          showrooms={showrooms}
          brands={brands}
          staff={staff}
          onClose={() => setEditTarget(null)}
          onDone={(msg) => { setEditTarget(null); flash(msg); router.refresh(); }}
        />
      )}
      {allocTarget && (
        <StrategyModal
          team={allocTarget}
          onClose={() => setAllocTarget(null)}
          onDone={(msg) => { setAllocTarget(null); flash(msg); router.refresh(); }}
        />
      )}
      {deleteTarget && (
        <DeleteTeamModal
          team={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDone={(msg) => { setDeleteTarget(null); flash(msg); router.refresh(); }}
        />
      )}
    </section>
  );
}

// ─── Modal thêm/sửa phòng ────────────────────────────────────────────────────

function EditTeamModal({
  target, showrooms, brands, staff, onClose, onDone,
}: {
  target: SalesTeamRow | 'new';
  showrooms: ShowroomRow[];
  brands: BrandRow[];
  staff: StaffRow[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const isNew = target === 'new';
  const init = isNew ? null : target;

  const [name, setName] = useState(init?.name ?? '');
  const [showroomId, setShowroomId] = useState(init?.showroom_id ?? '');
  const [brandId, setBrandId] = useState(init?.brand_id ?? '');
  const [headUserId, setHeadUserId] = useState(init?.head_user_id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Thương hiệu chọn được = thương hiệu showroom đang chọn thực sự kinh doanh.
  const selectedShowroom = showrooms.find((s) => s.id === showroomId);
  const brandOptions = brands.filter((b) => (selectedShowroom?.brand_ids ?? []).includes(b.id));

  // Trưởng phòng: chọn trong nhân sự cùng showroom (hoặc đang thuộc phòng này).
  const headOptions = staff.filter((u) =>
    (!isNew && u.sales_team_id === init?.id) ||
    (showroomId && u.showroom_id === showroomId)
  );

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError('Vui lòng nhập tên phòng.'); return; }
    if (isNew && (!showroomId || !brandId)) { setError('Chọn showroom và thương hiệu.'); return; }
    setSubmitting(true);
    try {
      const body = isNew
        ? { op: 'create', name: name.trim(), showroom_id: showroomId, brand_id: brandId, head_user_id: headUserId || null }
        : { op: 'update', id: init!.id, name: name.trim(), head_user_id: headUserId || null };
      const res = await fetch('/api/admin/sales-teams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Lưu thất bại.'); return; }
      onDone(isNew ? `Đã tạo phòng "${name.trim()}".` : `Đã cập nhật phòng "${name.trim()}".`);
    } catch {
      setError('Lỗi kết nối máy chủ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{isNew ? 'Thêm phòng bán hàng' : 'Chỉnh sửa phòng'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Tên phòng">
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#004B9B]" placeholder="Phòng KIA 1" />
          </Field>
          {isNew ? (
            <>
              <Field label="Showroom">
                <select value={showroomId} onChange={(e) => { setShowroomId(e.target.value); setBrandId(''); }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#004B9B] bg-white">
                  <option value="">— Chọn showroom —</option>
                  {showrooms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Thương hiệu">
                <select value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={!showroomId}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#004B9B] bg-white disabled:bg-slate-50 disabled:text-slate-400">
                  <option value="">{!showroomId ? '— Chọn showroom trước —' : '— Chọn thương hiệu —'}</option>
                  {brandOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                {showroomId && brandOptions.length === 0 && (
                  <p className="text-[11px] text-rose-500 mt-1">Showroom này chưa gắn thương hiệu nào.</p>
                )}
              </Field>
            </>
          ) : (
            <div className="text-xs text-slate-500">
              {showrooms.find((s) => s.id === init!.showroom_id)?.name} · {brands.find((b) => b.id === init!.brand_id)?.name}
              <span className="text-slate-400"> (không đổi được showroom/thương hiệu của phòng)</span>
            </div>
          )}
          <Field label="Trưởng phòng (TP Phòng)">
            <select value={headUserId} onChange={(e) => setHeadUserId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#004B9B] bg-white">
              <option value="">— Chưa gán —</option>
              {headOptions.map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
            </select>
          </Field>
          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <button onClick={onClose} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50">Hủy</button>
          <button onClick={submit} disabled={submitting}
            className="text-sm font-medium text-white rounded-lg px-4 py-2 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #004B9B, #0468BF)' }}>
            {submitting ? 'Đang lưu...' : (isNew ? 'Tạo phòng' : 'Lưu thay đổi')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal cách chia lead cho TVBH + tỷ lệ phòng ──────────────────────────────

function StrategyModal({
  team, onClose, onDone,
}: {
  team: SalesTeamRow;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [strategy, setStrategy] = useState<AssignStrategy>(team.tvbh_assign_strategy ?? 'least_loaded');
  const [sharePct, setSharePct] = useState(String(team.assign_share_pct ?? 0));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/sales-teams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'set-strategy', sales_team_id: team.id,
          tvbh_assign_strategy: strategy, assign_share_pct: Number(sharePct) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Lưu thất bại.'); return; }
      onDone(`Đã cập nhật cách chia lead phòng "${team.name}".`);
    } catch {
      setError('Lỗi kết nối máy chủ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">Cách chia lead — {team.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Cách chia lead cho TVBH trong phòng">
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as AssignStrategy)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#004B9B] bg-white">
              <option value="least_loaded">{STRATEGY_LABELS.least_loaded}</option>
              <option value="round_robin">{STRATEGY_LABELS.round_robin}</option>
              <option value="weighted">{STRATEGY_LABELS.weighted}</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Khi chọn &quot;Theo tỷ lệ %&quot;, nhập % cho từng TVBH ở mục quản lý nhân sự.</p>
          </Field>
          <Field label="Tỷ lệ nhận lead của phòng (%)">
            <input type="number" min={0} value={sharePct} onChange={(e) => setSharePct(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#004B9B]" />
            <p className="text-[11px] text-slate-400 mt-1">Chỉ dùng khi showroom chia lead vào phòng theo tỷ lệ. Tổng các phòng cùng showroom nên bằng 100%.</p>
          </Field>
          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <button onClick={onClose} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50">Hủy</button>
          <button onClick={submit} disabled={submitting}
            className="text-sm font-medium text-white rounded-lg px-4 py-2 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #004B9B, #0468BF)' }}>
            {submitting ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal xoá phòng ──────────────────────────────────────────────────────────

function DeleteTeamModal({ team, onClose, onDone }: { team: SalesTeamRow; onClose: () => void; onDone: (m: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setDeleting(true); setError(null);
    try {
      const res = await fetch('/api/admin/sales-teams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'delete', id: team.id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Xoá thất bại.'); return; }
      onDone(`Đã xoá phòng "${team.name}".`);
    } catch {
      setError('Lỗi kết nối máy chủ.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={() => !deleting && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">Xoá phòng "{team.name}"?</h3>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-600">Chỉ xoá được khi phòng không còn nhân sự và lead. Hành động không thể hoàn tác.</p>
          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60">
          <button onClick={onClose} disabled={deleting} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50">Hủy</button>
          <button onClick={run} disabled={deleting}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white rounded-lg px-4 py-2 disabled:opacity-60"
            style={{ background: '#dc2626' }}>
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting ? 'Đang xoá...' : 'Xoá phòng'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
