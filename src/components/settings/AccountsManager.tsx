'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Plus, Search, Edit2, Trash2, X, Check, AlertTriangle, KeyRound, Loader2 } from 'lucide-react';
import {
  ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_SCOPE, ROLE_CAN, ROLE_CANNOT, ROLE_NEEDS,
  ROLE_COLOR, roleNeedsShowroom, roleNeedsBrand, roleNeedsSalesTeam, CREATABLE_ROLES,
} from '@/lib/nav';
import { type UserRole } from '@/types/database';
import { EMAIL_DOMAIN, usernameToEmail } from '@/lib/account-email';

export interface StaffRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  showroom_id: string | null;
  brand_id: string | null;
  sales_team_id: string | null;
  is_active: boolean;
  assign_share_pct?: number;
  // Đa phạm vi: tập showroom/thương hiệu phụ trách (từ bảng phụ user_showrooms / user_brands).
  showroom_ids?: string[];
  brand_ids?: string[];
}

export interface ShowroomOption {
  id: string;
  name: string;
  code?: string | null;
  brand_ids?: string[];
}

export interface BrandOption {
  id: string;
  name: string;
}

// Phòng bán hàng cho dropdown tài khoản. label = "Showroom · Thương hiệu · Tên phòng".
export interface SalesTeamOption {
  id: string;
  showroom_id: string;
  brand_id: string | null;
  label: string;
}

export default function AccountsManager({
  staff, showrooms, brands, salesTeams, companyId, currentUserId,
}: {
  staff: StaffRow[]; showrooms: ShowroomOption[]; brands: BrandOption[]; salesTeams: SalesTeamOption[]; companyId: string; currentUserId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');

  const [success, setSuccess] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<StaffRow | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null);

  // Danh sách showroom của 1 user: ưu tiên bảng phụ (đa phạm vi), fallback cột đơn (tương thích ngược).
  const showroomNames = (u: StaffRow) => {
    const ids = (u.showroom_ids && u.showroom_ids.length > 0) ? u.showroom_ids : (u.showroom_id ? [u.showroom_id] : []);
    const names = ids.map((id) => showrooms.find((s) => s.id === id)?.name).filter(Boolean) as string[];
    return names.length > 0 ? names.join(', ') : null;
  };

  const brandNames = (u: StaffRow) => {
    const ids = (u.brand_ids && u.brand_ids.length > 0) ? u.brand_ids : (u.brand_id ? [u.brand_id] : []);
    const names = ids.map((id) => brands.find((b) => b.id === id)?.name).filter(Boolean) as string[];
    return names.length > 0 ? names.join(', ') : null;
  };

  const teamLabel = (id: string | null) => {
    if (!id) return null;
    const t = salesTeams.find((x) => x.id === id);
    return t ? t.label : null;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((u) => {
      const matchSearch = !q
        || (u.full_name ?? '').toLowerCase().includes(q)
        || (u.email ?? '').toLowerCase().includes(q);
      const matchRole = !filterRole || u.role === filterRole;
      return matchSearch && matchRole;
    });
  }, [staff, search, filterRole]);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3500); };

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={18} style={{ color: '#004B9B' }} />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Danh sách tài khoản</h2>
            <p className="text-xs text-slate-400 mt-0.5">Phân quyền theo cấu trúc: Công ty → Showroom → TVBH</p>
          </div>
        </div>
        <button
          onClick={() => setEditTarget('new')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white rounded-lg px-3 py-1.5 transition-colors"
          style={{ background: 'linear-gradient(135deg, #004B9B, #0468BF)' }}
        >
          <Plus size={15} /> Thêm tài khoản
        </button>
      </div>

      {success && (
        <div className="px-5 py-2.5 text-sm bg-emerald-50 text-emerald-700 border-b border-emerald-100 flex items-center gap-2">
          <Check size={14} /> {success}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên, email..."
                className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-sm outline-none focus:border-[#004B9B] bg-white"
              />
            </div>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="flex-1 sm:flex-none border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#004B9B] bg-white"
            >
              <option value="">Tất cả vai trò</option>
              {CREATABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <span className="ml-auto text-xs text-slate-400">{filtered.length} tài khoản</span>
          </div>

          {/* Table */}
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Họ tên &amp; Email</th>
                <th className="px-4 py-2.5 font-semibold">Vai trò</th>
                <th className="px-4 py-2.5 font-semibold">Phạm vi</th>
                <th className="px-4 py-2.5 font-semibold text-center">Trạng thái</th>
                <th className="px-4 py-2.5 font-semibold text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const c = ROLE_COLOR[u.role as UserRole] ?? { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
                const isSelf = u.id === currentUserId;
                return (
                  <tr key={u.id} className="border-t border-slate-100" style={{ background: isSelf ? '#fffbeb' : undefined }}>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                        >
                          {(u.full_name ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">
                            {u.full_name ?? '—'}
                            {isSelf && <span className="ml-2 text-[10px] font-bold text-amber-500">Bạn</span>}
                          </div>
                          <div className="text-xs text-slate-500">{u.email ?? '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-block text-xs font-semibold border rounded-full px-2.5 py-0.5"
                        style={{ background: c.bg, color: c.text, borderColor: c.border }}
                      >
                        {ROLE_LABELS[u.role as UserRole] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {roleNeedsSalesTeam(u.role as UserRole)
                        ? (teamLabel(u.sales_team_id) ?? <span className="text-rose-500 italic text-xs">Chưa gán phòng</span>)
                        : roleNeedsShowroom(u.role as UserRole)
                        ? (showroomNames(u) ?? <span className="text-rose-500 italic text-xs">Chưa gán SR</span>)
                        : roleNeedsBrand(u.role as UserRole)
                        ? (brandNames(u) ?? <span className="text-rose-500 italic text-xs">Chưa gán TH</span>)
                        : <span className="text-slate-400 italic text-xs">Toàn công ty</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block text-xs font-medium rounded-full px-2.5 py-0.5 ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                        {u.is_active ? 'Hoạt động' : 'Tạm khoá'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <IconBtn title="Đổi mật khẩu" onClick={() => resetPassword(u, flash)}>
                          <KeyRound size={14} className="text-emerald-600" />
                        </IconBtn>
                        <IconBtn title="Chỉnh sửa" onClick={() => setEditTarget(u)}>
                          <Edit2 size={14} style={{ color: '#004B9B' }} />
                        </IconBtn>
                        {!isSelf && (
                          <IconBtn title="Xoá tài khoản" onClick={() => setDeleteTarget(u)}>
                            <Trash2 size={14} className="text-rose-600" />
                          </IconBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Không tìm thấy tài khoản nào.</td></tr>
              )}
            </tbody>
          </table>

      {editTarget && (
        <EditModal
          target={editTarget}
          showrooms={showrooms}
          brands={brands}
          salesTeams={salesTeams}
          companyId={companyId}
          onClose={() => setEditTarget(null)}
          onDone={(msg) => { setEditTarget(null); flash(msg); router.refresh(); }}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDone={(msg) => { setDeleteTarget(null); flash(msg); router.refresh(); }}
        />
      )}
    </section>
  );
}

// ─── Reset password (prompt nhanh, giống Budget) ───────────────────────────────

async function resetPassword(u: StaffRow, flash: (m: string) => void) {
  const pw = window.prompt(`Nhập mật khẩu mới cho ${u.full_name ?? u.email}:`);
  if (!pw) return;
  if (pw.length < 6) { window.alert('Mật khẩu tối thiểu 6 ký tự.'); return; }
  const res = await fetch('/api/admin/reset-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: u.id, newPassword: pw }),
  });
  const data = await res.json();
  if (!res.ok) { window.alert(data.error ?? 'Đổi mật khẩu thất bại.'); return; }
  flash(`Đã đổi mật khẩu cho ${u.full_name ?? u.email}.`);
}

// ─── Icon button ───────────────────────────────────────────────────────────────

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50 transition-colors"
    >
      {children}
    </button>
  );
}

// ─── Tab phân quyền ─────────────────────────────────────────────────────────────

export function RoleReference() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="text-sm text-slate-500 mb-4">
        Mỗi loại tài khoản có bộ quyền cố định theo quy trình. Khi tạo tài khoản, chọn đúng loại và gán showroom theo hướng dẫn.
      </p>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {CREATABLE_ROLES.map((role) => {
          const c = ROLE_COLOR[role];
          return (
            <div key={role} className="rounded-xl bg-white overflow-hidden shadow-sm" style={{ border: `1.5px solid ${c.border}` }}>
              <div className="px-4 py-3 flex items-start justify-between" style={{ background: c.bg, borderBottom: `1px solid ${c.border}` }}>
                <div>
                  <div className="text-sm font-bold" style={{ color: c.text }}>{ROLE_LABELS[role]}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: c.text, opacity: 0.8 }}>{ROLE_DESCRIPTIONS[role]}</div>
                </div>
              </div>
              <div className="px-4 py-3 flex flex-col gap-2.5">
                <Row label="Phạm vi" color="#64748b" text={ROLE_SCOPE[role]} />
                <Row label="Cần gán" color="#64748b" text={ROLE_NEEDS[role]} />
                {ROLE_CAN[role].length > 0 && (
                  <Bullets label="Được làm" labelColor="#16a34a" dot="#16a34a" items={ROLE_CAN[role]} />
                )}
                {ROLE_CANNOT[role].length > 0 && (
                  <Bullets label="Không được" labelColor="#dc2626" dot="#dc2626" items={ROLE_CANNOT[role]} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, color, text }: { label: string; color: string; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] font-bold w-16 shrink-0 pt-0.5" style={{ color }}>{label}</span>
      <span className="text-[11px] text-slate-700">{text}</span>
    </div>
  );
}

function Bullets({ label, labelColor, dot, items }: { label: string; labelColor: string; dot: string; items: string[] }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] font-bold w-16 shrink-0 pt-1" style={{ color: labelColor }}>{label}</span>
      <div className="flex flex-col gap-1">
        {items.map((it) => (
          <div key={it} className="flex items-center gap-1.5 text-[11px] text-slate-700">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
            {it}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Modal thêm/sửa ─────────────────────────────────────────────────────────────

function EditModal({
  target, showrooms, brands, salesTeams, companyId, onClose, onDone,
}: {
  target: StaffRow | 'new';
  showrooms: ShowroomOption[];
  brands: BrandOption[];
  salesTeams: SalesTeamOption[];
  companyId: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const isNew = target === 'new';
  const init = isNew ? null : target;

  // Prefill mảng: ưu tiên bảng phụ, fallback cột đơn (tương thích ngược).
  const initShowroomIds = (init?.showroom_ids && init.showroom_ids.length > 0)
    ? init.showroom_ids : (init?.showroom_id ? [init.showroom_id] : []);
  const initBrandIds = (init?.brand_ids && init.brand_ids.length > 0)
    ? init.brand_ids : (init?.brand_id ? [init.brand_id] : []);

  const [fullName, setFullName] = useState(init?.full_name ?? '');
  // Form chỉ nhập username (phần trước @) — bỏ đuôi domain khi prefill tài khoản đang sửa.
  const [email, setEmail] = useState((init?.email ?? '').replace(/@.*$/, ''));
  const [role, setRole] = useState<UserRole>((init?.role as UserRole) ?? 'tvbh');
  const [showroomIds, setShowroomIds] = useState<string[]>(initShowroomIds);
  const [brandIds, setBrandIds] = useState<string[]>(initBrandIds);
  const [teamId, setTeamId] = useState(init?.sales_team_id ?? '');
  const [isActive, setIsActive] = useState(init?.is_active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TVBH & TP Phòng chỉ chọn phòng (suy ra showroom + thương hiệu). Vai trò khác như cũ.
  const needsTeam = roleNeedsSalesTeam(role);
  const needsShowroom = roleNeedsShowroom(role);
  const needsBrand = roleNeedsBrand(role);

  const toggleShowroom = (id: string) =>
    setShowroomIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleBrand = (id: string) =>
    setBrandIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const submit = async () => {
    setError(null);
    if (!fullName.trim() || !email.trim()) { setError('Vui lòng nhập họ tên và tên đăng nhập.'); return; }
    if (needsTeam && !teamId) { setError('Vai trò này bắt buộc gán 1 phòng bán hàng.'); return; }
    if (needsShowroom && showroomIds.length === 0) { setError('Vai trò này bắt buộc gán ≥1 showroom.'); return; }
    if (needsBrand && brandIds.length === 0) { setError('Vai trò này bắt buộc gán ≥1 thương hiệu.'); return; }
    setSubmitting(true);
    try {
      if (isNew) {
        const res = await fetch('/api/admin/create-user', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: usernameToEmail(email), full_name: fullName.trim(), role,
            company_id: companyId,
            showroom_ids: needsShowroom ? showroomIds : [],
            brand_ids: needsBrand ? brandIds : [],
            sales_team_id: needsTeam ? teamId : null,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Tạo tài khoản thất bại.'); return; }
        onDone(`Đã tạo tài khoản "${fullName.trim()}". Mật khẩu mặc định: thaco123`);
      } else {
        const res = await fetch('/api/admin/update-user', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: (target as StaffRow).id, full_name: fullName.trim(), email: email.trim(), role,
            showroom_ids: needsShowroom ? showroomIds : [],
            brand_ids: needsBrand ? brandIds : [],
            sales_team_id: needsTeam ? teamId : null,
            is_active: isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Cập nhật thất bại.'); return; }
        onDone(`Đã cập nhật "${fullName.trim()}".`);
      }
    } catch {
      setError('Lỗi kết nối máy chủ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{isNew ? 'Thêm tài khoản mới' : 'Chỉnh sửa tài khoản'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Họ tên">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#004B9B]" placeholder="Nguyễn Văn A" />
          </Field>
          <Field label="Tên đăng nhập">
            <div className="flex items-stretch border border-slate-200 rounded-lg overflow-hidden focus-within:border-[#004B9B]">
              <input type="text" value={email} onChange={(e) => setEmail(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 text-sm outline-none" placeholder="nguyenvana" autoComplete="off" />
              <span className="px-3 py-2 text-sm text-slate-400 bg-slate-50 border-l border-slate-100 whitespace-nowrap select-none">@{EMAIL_DOMAIN}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {isNew
                ? `Chỉ nhập tên, hệ thống tự thêm @${EMAIL_DOMAIN}`
                : 'Đổi tên đăng nhập sẽ áp dụng cho lần đăng nhập kế tiếp.'}
            </p>
          </Field>
          <Field label="Vai trò">
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#004B9B] bg-white">
              {CREATABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">{ROLE_SCOPE[role]}</p>
          </Field>
          {needsTeam && (
            <Field label="Phòng bán hàng">
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#004B9B] bg-white">
                <option value="">— Chọn phòng bán hàng —</option>
                {salesTeams.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              {salesTeams.length === 0 && (
                <p className="text-[11px] text-rose-500 mt-1">Chưa có phòng bán hàng nào. Tạo tại tab Phòng bán hàng.</p>
              )}
              <p className="text-[11px] text-slate-400 mt-1">Showroom &amp; thương hiệu được suy ra từ phòng.</p>
            </Field>
          )}
          {needsShowroom && (
            <Field label="Showroom phụ trách (chọn nhiều)">
              <div className="border border-slate-200 rounded-lg p-2 max-h-44 overflow-y-auto flex flex-col gap-1">
                {showrooms.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer px-1.5 py-1 rounded hover:bg-slate-50">
                    <input type="checkbox" checked={showroomIds.includes(s.id)} onChange={() => toggleShowroom(s.id)} className="accent-[#004B9B]" />
                    {s.name}
                  </label>
                ))}
                {showrooms.length === 0 && <p className="text-[11px] text-rose-500 px-1.5 py-1">Chưa có showroom nào.</p>}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Đã chọn {showroomIds.length} showroom.</p>
            </Field>
          )}
          {needsBrand && (
            <Field label="Thương hiệu phụ trách (chọn nhiều)">
              <div className="border border-slate-200 rounded-lg p-2 max-h-44 overflow-y-auto flex flex-col gap-1">
                {brands.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer px-1.5 py-1 rounded hover:bg-slate-50">
                    <input type="checkbox" checked={brandIds.includes(b.id)} onChange={() => toggleBrand(b.id)} className="accent-[#004B9B]" />
                    {b.name}
                  </label>
                ))}
                {brands.length === 0 && <p className="text-[11px] text-rose-500 px-1.5 py-1">Chưa có thương hiệu nào.</p>}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Đã chọn {brandIds.length} thương hiệu.</p>
            </Field>
          )}
          {!isNew && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-[#004B9B]" />
              Tài khoản đang hoạt động
            </label>
          )}
          {isNew && (
            <p className="text-xs text-slate-400">Mật khẩu mặc định khi tạo: <span className="font-mono font-semibold">thaco123</span></p>
          )}
          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <button onClick={onClose} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50">Hủy</button>
          <button onClick={submit} disabled={submitting}
            className="text-sm font-medium text-white rounded-lg px-4 py-2 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #004B9B, #0468BF)' }}>
            {submitting ? 'Đang lưu...' : (isNew ? 'Tạo tài khoản' : 'Lưu thay đổi')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal xoá ───────────────────────────────────────────────────────────────

function DeleteModal({ target, onClose, onDone }: { target: StaffRow; onClose: () => void; onDone: (m: string) => void }) {
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setDeleting(true); setError(null);
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: target.id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Xoá thất bại.'); return; }
      onDone(`Đã xoá tài khoản ${target.full_name ?? target.email}.`);
    } catch {
      setError('Lỗi kết nối máy chủ.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={() => !deleting && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-3.5 bg-rose-50 border-b border-rose-100">
          <AlertTriangle size={18} className="text-rose-600" />
          <h3 className="font-bold text-rose-800">Xác nhận xoá tài khoản</h3>
        </div>
        <div className="p-5 space-y-3.5">
          <p className="text-sm text-slate-700">
            Bạn sắp xoá tài khoản <strong className="text-slate-900">{target.full_name ?? '—'}</strong>{' '}
            (<span className="font-mono text-xs">{target.email}</span>).
          </p>
          <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
            <strong>Hành động không thể hoàn tác:</strong>
            <ul className="mt-1 pl-4 list-disc space-y-0.5">
              <li>Tài khoản không thể đăng nhập trở lại</li>
              <li>Lịch sử lead/nhật ký vẫn được giữ để truy vết</li>
              <li>Email có thể dùng lại để tạo tài khoản mới sau này</li>
            </ul>
          </div>
          <label className="block text-xs font-semibold text-slate-600">
            Gõ <strong className="font-mono text-rose-600">XÓA</strong> để xác nhận:
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus disabled={deleting} placeholder="XÓA"
              className="mt-1.5 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-rose-400" />
          </label>
          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60">
          <button onClick={onClose} disabled={deleting} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50">Hủy</button>
          <button onClick={run} disabled={deleting || confirm !== 'XÓA'}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white rounded-lg px-4 py-2 disabled:opacity-60"
            style={{ background: deleting || confirm !== 'XÓA' ? '#fca5a5' : '#dc2626' }}>
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting ? 'Đang xoá...' : 'Xoá vĩnh viễn'}
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
