'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EMAIL_DOMAIN } from '@/lib/account-email';
import type { PlatformCompany, PlatformBrand } from './types';

async function patchCompany(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/platform/companies', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data?.error };
}

async function createCompany(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/platform/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data?.error };
}

export default function CompaniesManager({
  companies, brands,
}: { companies: PlatformCompany[]; brands: PlatformBrand[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<PlatformCompany | null>(null);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 4000); };

  const toggleSuspend = async (c: PlatformCompany) => {
    const next = c.plan_status === 'suspended' ? 'active' : 'suspended';
    const verb = next === 'suspended' ? 'Tạm khóa' : 'Mở khóa';
    if (!window.confirm(`${verb} công ty "${c.name}"?`)) return;
    const r = await patchCompany({ id: c.id, plan_status: next });
    if (!r.ok) { window.alert(r.error ?? 'Lỗi'); return; }
    flashMsg(`Đã ${verb.toLowerCase()} "${c.name}".`); router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{companies.length} công ty</p>
        <button onClick={() => setAdding(true)}
          className="text-sm font-medium px-3.5 py-2 rounded-lg text-white" style={{ background: '#004B9B' }}>
          + Thêm công ty
        </button>
      </div>
      {flash && (
        <div className="text-sm bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg px-3 py-2 whitespace-pre-line">{flash}</div>
      )}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Công ty</th>
              <th className="px-4 py-2.5 font-semibold">Subdomain</th>
              <th className="px-4 py-2.5 font-semibold">Showroom</th>
              <th className="px-4 py-2.5 font-semibold">Thương hiệu</th>
              <th className="px-4 py-2.5 font-semibold">Trạng thái</th>
              <th className="px-4 py-2.5 font-semibold text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const ratio = c.max_showrooms > 0 ? c.showroom_used / c.max_showrooms : 1;
              const warn = ratio >= 1 ? '#e11d48' : ratio >= 0.8 ? '#d97706' : '#64748b';
              const suspended = c.plan_status === 'suspended';
              return (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{c.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{c.subdomain ?? '—'}</td>
                  <td className="px-4 py-2.5 font-medium" style={{ color: warn }}>
                    {c.showroom_used}/{c.max_showrooms}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{c.brand_ids.length}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block text-xs font-medium rounded-md px-2 py-0.5"
                      style={suspended
                        ? { background: '#fef2f2', color: '#b91c1c' }
                        : { background: '#f0fdf4', color: '#166534' }}>
                      {suspended ? 'Tạm khóa' : 'Hoạt động'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => setEdit(c)}
                        className="text-xs font-medium px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
                        style={{ color: '#004B9B' }}>Sửa</button>
                      <button onClick={() => toggleSuspend(c)}
                        className="text-xs font-medium px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
                        style={{ color: suspended ? '#166534' : '#e11d48' }}>
                        {suspended ? 'Mở' : 'Khóa'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {companies.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Chưa có công ty.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <QuotaModal company={edit} brands={brands}
          onClose={() => setEdit(null)}
          onDone={(m) => { setEdit(null); flashMsg(m); router.refresh(); }} />
      )}

      {adding && (
        <AddCompanyModal brands={brands}
          onClose={() => setAdding(false)}
          onDone={(m) => { setAdding(false); flashMsg(m); router.refresh(); }} />
      )}
    </div>
  );
}

function AddCompanyModal({
  brands, onClose, onDone,
}: { brands: PlatformBrand[]; onClose: () => void; onDone: (m: string) => void }) {
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [maxSr, setMaxSr] = useState('3');
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [adminName, setAdminName] = useState('');
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleBrand = (id: string) =>
    setBrandIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    setError(null);
    if (!name.trim() || !subdomain.trim()) { setError('Nhập tên công ty và subdomain.'); return; }
    if (!/^[a-z0-9-]+$/.test(subdomain.trim().toLowerCase())) {
      setError('Subdomain chỉ gồm chữ thường, số và dấu gạch ngang.'); return;
    }
    if (!adminName.trim() || !adminUser.trim() || !adminPass) { setError('Nhập đủ thông tin admin đầu tiên.'); return; }
    if (adminPass.length < 6) { setError('Mật khẩu admin tối thiểu 6 ký tự.'); return; }
    setBusy(true);
    const r = await createCompany({
      name: name.trim(),
      subdomain: subdomain.trim().toLowerCase(),
      max_showrooms: Math.floor(Number(maxSr) || 0),
      brand_ids: brandIds,
      admin_full_name: adminName.trim(),
      admin_username: adminUser.trim(),
      admin_password: adminPass,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? 'Lỗi'); return; }
    onDone(`Đã tạo công ty "${name.trim()}".\nAdmin đăng nhập: ${adminUser.trim()} (đuôi @${EMAIL_DOMAIN})`);
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">Thêm công ty mới</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên công ty</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Thaco Auto Đà Nẵng"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Subdomain</label>
            <div className="flex items-stretch border border-slate-200 rounded-lg overflow-hidden focus-within:border-[#004B9B]">
              <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="danang"
                className="flex-1 min-w-0 px-3 py-2 text-sm outline-none" autoComplete="off" />
              <span className="px-3 py-2 text-sm text-slate-400 bg-slate-50 border-l border-slate-100 whitespace-nowrap select-none">.crmthacoauto.com</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Địa chỉ đăng nhập của công ty. Chỉ chữ thường, số, gạch ngang.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Showroom tối đa</label>
            <input value={maxSr} onChange={(e) => setMaxSr(e.target.value)} inputMode="numeric"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Thương hiệu được cấp</label>
            <div className="space-y-1.5">
              {brands.map((b) => {
                const checked = brandIds.includes(b.id);
                return (
                  <label key={b.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer"
                    style={{ borderColor: checked ? '#004B9B' : '#e2e8f0', background: checked ? '#e6f0fa' : '#fff' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleBrand(b.id)} className="accent-[#004B9B]" />
                    <span className="text-sm font-medium text-slate-700">{b.name}</span>
                  </label>
                );
              })}
              {brands.length === 0 && <p className="text-sm text-slate-400">Chưa có thương hiệu.</p>}
            </div>
          </div>

          <div className="pt-1 border-t border-slate-100">
            <p className="text-sm font-semibold text-slate-800 mt-3 mb-2">Tài khoản quản trị đầu tiên</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Họ tên admin</label>
                <input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Nguyễn Văn A"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên đăng nhập</label>
                <div className="flex items-stretch border border-slate-200 rounded-lg overflow-hidden focus-within:border-[#004B9B]">
                  <input value={adminUser} onChange={(e) => setAdminUser(e.target.value)} placeholder="admindanang"
                    className="flex-1 min-w-0 px-3 py-2 text-sm outline-none" autoComplete="off" />
                  <span className="px-3 py-2 text-sm text-slate-400 bg-slate-50 border-l border-slate-100 whitespace-nowrap select-none">@{EMAIL_DOMAIN}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
                <input value={adminPass} onChange={(e) => setAdminPass(e.target.value)} type="text"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="tối thiểu 6 ký tự" />
              </div>
            </div>
          </div>

          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <button onClick={onClose} disabled={busy}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">Hủy</button>
          <button onClick={submit} disabled={busy}
            className="text-sm font-medium px-4 py-2 rounded-lg text-white" style={{ background: '#004B9B' }}>
            {busy ? 'Đang tạo...' : 'Tạo công ty'}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuotaModal({
  company, brands, onClose, onDone,
}: { company: PlatformCompany; brands: PlatformBrand[]; onClose: () => void; onDone: (m: string) => void }) {
  const [maxSr, setMaxSr] = useState(String(company.max_showrooms));
  const [brandIds, setBrandIds] = useState<string[]>(company.brand_ids);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleBrand = (id: string) =>
    setBrandIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    setError(null);
    const n = Number(maxSr);
    if (!Number.isFinite(n) || n < company.showroom_used) {
      setError(`Số showroom tối đa không được nhỏ hơn số đang dùng (${company.showroom_used}).`);
      return;
    }
    setBusy(true);
    const r = await patchCompany({ id: company.id, max_showrooms: Math.floor(n), brand_ids: brandIds });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? 'Lỗi'); return; }
    onDone(`Đã cập nhật quota "${company.name}".`);
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">Quota — {company.name}</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Showroom tối đa</label>
            <input value={maxSr} onChange={(e) => setMaxSr(e.target.value)} inputMode="numeric"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <p className="text-xs text-slate-400 mt-1">Đang dùng {company.showroom_used} showroom.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Thương hiệu được cấp</label>
            <div className="space-y-1.5">
              {brands.map((b) => {
                const checked = brandIds.includes(b.id);
                return (
                  <label key={b.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer"
                    style={{ borderColor: checked ? '#004B9B' : '#e2e8f0', background: checked ? '#e6f0fa' : '#fff' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleBrand(b.id)} className="accent-[#004B9B]" />
                    <span className="text-sm font-medium text-slate-700">{b.name}</span>
                  </label>
                );
              })}
              {brands.length === 0 && <p className="text-sm text-slate-400">Chưa có thương hiệu.</p>}
            </div>
          </div>
          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <button onClick={onClose} disabled={busy}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">Hủy</button>
          <button onClick={submit} disabled={busy}
            className="text-sm font-medium px-4 py-2 rounded-lg text-white" style={{ background: '#004B9B' }}>
            {busy ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}
