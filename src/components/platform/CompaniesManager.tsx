'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EMAIL_DOMAIN } from '@/lib/account-email';
import { STATUS_LABEL, type LeadStatus } from '@/lib/lead-status';
import { formatPhoneDisplay } from '@/lib/phone';
import type { PlatformCompany, PlatformBrand, CompanyViewData } from './types';
import { useDialogs } from '@/components/ui/dialogs';

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

async function toggleShowroom(companyId: string, showroomId: string, isActive: boolean): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/platform/companies/${companyId}/showrooms`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ showroom_id: showroomId, is_active: isActive }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data?.error };
}

async function createShowroom(companyId: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; id?: string }> {
  const res = await fetch(`/api/platform/companies/${companyId}/showrooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data?.error, id: data?.id };
}

async function updateShowroom(companyId: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/platform/companies/${companyId}/showrooms`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data?.error };
}

async function deleteShowroom(companyId: string, showroomId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/platform/companies/${companyId}/showrooms`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ showroom_id: showroomId }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data?.error };
}

type SrItem = { id: string; name: string; code: string | null; is_active: boolean; brand_ids: string[] };

export default function CompaniesManager({
  companies, brands,
}: { companies: PlatformCompany[]; brands: PlatformBrand[] }) {
  const router = useRouter();
  const { confirm, alert, dialog } = useDialogs();
  const [edit, setEdit] = useState<PlatformCompany | null>(null);
  const [viewing, setViewing] = useState<PlatformCompany | null>(null);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 4000); };

  const toggleSuspend = async (c: PlatformCompany) => {
    const next = c.plan_status === 'suspended' ? 'active' : 'suspended';
    const verb = next === 'suspended' ? 'Tạm khóa' : 'Mở khóa';
    if (!(await confirm({ title: `${verb} công ty`, message: `${verb} công ty "${c.name}"?`, danger: next === 'suspended', confirmText: verb }))) return;
    const r = await patchCompany({ id: c.id, plan_status: next });
    if (!r.ok) { await alert({ title: 'Lỗi', message: r.error ?? 'Lỗi' }); return; }
    flashMsg(`Đã ${verb.toLowerCase()} "${c.name}".`); router.refresh();
  };

  return (
    <div className="space-y-4">
      {dialog}
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
                    {c.showroom_inactive > 0 && (
                      <span className="ml-1 text-xs font-normal text-slate-400">(+{c.showroom_inactive} tắt)</span>
                    )}
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
                      <button onClick={() => setViewing(c)}
                        className="text-xs font-medium px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">Xem</button>
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

      {viewing && (
        <CompanyViewModal company={viewing} onClose={() => setViewing(null)} />
      )}

      {adding && (
        <AddCompanyModal brands={brands}
          onClose={() => setAdding(false)}
          onDone={(m) => { setAdding(false); flashMsg(m); router.refresh(); }} />
      )}
    </div>
  );
}

function CompanyViewModal({ company, onClose }: { company: PlatformCompany; onClose: () => void }) {
  const [data, setData] = useState<CompanyViewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/platform/companies/${company.id}/view`);
      const json = await res.json().catch(() => ({}));
      if (!active) return;
      if (!res.ok) { setError(json?.error ?? 'Không tải được dữ liệu.'); return; }
      setData(json as CompanyViewData);
    })();
    return () => { active = false; };
  }, [company.id]);

  const fmt = (n: number) => n.toLocaleString('vi-VN');

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium rounded-md px-2 py-0.5 bg-amber-50 text-amber-700">Chỉ xem</span>
            <h3 className="font-bold text-slate-900">Đang xem {company.name}</h3>
          </div>
          <button onClick={onClose}
            className="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">Thoát</button>
        </div>

        {error && <div className="p-5"><div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div></div>}
        {!data && !error && <div className="p-8 text-center text-slate-400 text-sm">Đang tải…</div>}

        {data && (
          <div className="p-5 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Showroom" value={`${data.showrooms.length}/${data.company.max_showrooms}`} />
              <Stat label="Nhân sự" value={fmt(data.users.length)} />
              <Stat label="Tổng lead" value={fmt(data.leadTotal)} />
              <Stat label="Trạng thái" value={data.company.plan_status === 'suspended' ? 'Tạm khóa' : 'Hoạt động'} />
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-800 mb-2">Lead theo trạng thái</h4>
              <div className="flex flex-wrap gap-2">
                {Object.keys(data.statusCount).length === 0 && <p className="text-sm text-slate-400">Chưa có lead.</p>}
                {Object.entries(data.statusCount).map(([s, n]) => (
                  <span key={s} className="text-xs rounded-md px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-600">
                    {STATUS_LABEL[s as LeadStatus] ?? s}: <strong className="text-slate-800">{fmt(n)}</strong>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-800 mb-2">Showroom &amp; nhân sự</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">Showroom</div>
                  <ul className="divide-y divide-slate-100">
                    {data.showrooms.map((s) => (
                      <li key={s.id} className="px-3 py-2 text-sm text-slate-700 flex justify-between">
                        <span>{s.name}</span>{s.code && <span className="text-slate-400 font-mono text-xs">{s.code}</span>}
                      </li>
                    ))}
                    {data.showrooms.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">Chưa có showroom.</li>}
                  </ul>
                </div>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nhân sự</div>
                  <ul className="divide-y divide-slate-100">
                    {data.users.map((u) => (
                      <li key={u.id} className="px-3 py-2 text-sm flex justify-between items-center">
                        <span className="text-slate-700">{u.full_name}<span className="text-slate-400"> · {u.role}</span></span>
                        {!u.is_active && <span className="text-xs text-rose-500">khóa</span>}
                      </li>
                    ))}
                    {data.users.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">Chưa có nhân sự.</li>}
                  </ul>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-800 mb-2">Lead gần đây (tối đa 30)</h4>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Khách</th>
                      <th className="px-3 py-2 font-semibold">SĐT</th>
                      <th className="px-3 py-2 font-semibold">Trạng thái</th>
                      <th className="px-3 py-2 font-semibold">Showroom</th>
                      <th className="px-3 py-2 font-semibold">Ngày</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentLeads.map((l) => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{l.full_name ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{formatPhoneDisplay(l.phone)}</td>
                        <td className="px-3 py-2 text-slate-600">{STATUS_LABEL[l.status as LeadStatus] ?? l.status}</td>
                        <td className="px-3 py-2 text-slate-600">{l.showroom_name ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleDateString('vi-VN')}</td>
                      </tr>
                    ))}
                    {data.recentLeads.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Chưa có lead.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-lg font-bold text-slate-900 mt-0.5">{value}</p>
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
  const { confirm, dialog } = useDialogs();
  const [maxSr, setMaxSr] = useState(String(company.max_showrooms));
  const [brandIds, setBrandIds] = useState<string[]>(company.brand_ids);
  const [b10Enabled, setB10Enabled] = useState(company.b10_enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [srList, setSrList] = useState<SrItem[]>([]);
  const [srBusy, setSrBusy] = useState<string | null>(null);
  const [srEdit, setSrEdit] = useState<SrItem | null>(null); // null = không mở; object = sửa
  const [srAdding, setSrAdding] = useState(false);

  const reloadSr = React.useCallback(async () => {
    const res = await fetch(`/api/platform/companies/${company.id}/view`);
    const json = await res.json().catch(() => ({}));
    if (res.ok) setSrList((json.showrooms ?? []) as SrItem[]);
  }, [company.id]);

  React.useEffect(() => { reloadSr(); }, [reloadSr]);

  const onToggleSr = async (sid: string, next: boolean) => {
    setSrBusy(sid);
    const r = await toggleShowroom(company.id, sid, next);
    setSrBusy(null);
    if (!r.ok) { setError(r.error ?? 'Lỗi bật/tắt showroom'); return; }
    setSrList((prev) => prev.map((s) => (s.id === sid ? { ...s, is_active: next } : s)));
  };

  const onDeleteSr = async (s: SrItem) => {
    if (!(await confirm({ title: 'Xoá showroom', message: `Xoá vĩnh viễn showroom "${s.name}"? Không thể hoàn tác.`, danger: true, confirmText: 'Xoá' }))) return;
    setSrBusy(s.id);
    const r = await deleteShowroom(company.id, s.id);
    setSrBusy(null);
    if (!r.ok) { setError(r.error ?? 'Lỗi xoá showroom'); return; }
    setError(null);
    setSrList((prev) => prev.filter((x) => x.id !== s.id));
  };

  const srActiveCount = srList.filter((s) => s.is_active).length;
  const srTotal = srList.length;
  const quotaReached = srTotal >= Number(company.max_showrooms);
  // Brand công ty được cấp (đã lưu) → tập chọn được khi gán cho showroom.
  const grantedBrands = brands.filter((b) => company.brand_ids.includes(b.id));

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
    const r = await patchCompany({ id: company.id, max_showrooms: Math.floor(n), brand_ids: brandIds, b10_enabled: b10Enabled });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? 'Lỗi'); return; }
    onDone(`Đã cập nhật quota "${company.name}".`);
  };

  return (
    <>
    {dialog}
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-100 sticky top-0 bg-white z-10">
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
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-700">
                Showroom <span className="text-slate-400 font-normal">({srActiveCount} bật / {srTotal} tổng · trần {company.max_showrooms})</span>
              </label>
              <button type="button" onClick={() => setSrAdding(true)} disabled={quotaReached}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: '#004B9B' }}
                title={quotaReached ? 'Đã đạt trần showroom — nâng quota trước.' : undefined}>
                + Thêm showroom
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-2">Tắt = ẩn khỏi app, bot ngừng báo, lead vẫn nhận ngầm (khôi phục được). Xoá = vĩnh viễn, chỉ khi không còn lead/nhân sự.</p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {srList.map((s) => {
                const srBrandNames = s.brand_ids
                  .map((id) => brands.find((b) => b.id === id)?.name)
                  .filter(Boolean) as string[];
                return (
                <div key={s.id}
                  className="px-3 py-2 rounded-lg border"
                  style={{ borderColor: s.is_active ? '#004B9B' : '#e2e8f0', background: s.is_active ? '#e6f0fa' : '#f8fafc' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-700 min-w-0 truncate">
                      {s.name}{s.code && <span className="text-slate-400 font-mono text-xs"> · {s.code}</span>}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Công tắc trượt: phải/xanh = đang hoạt động; trái/xám = đã tắt */}
                      <button type="button" role="switch" aria-checked={s.is_active} disabled={srBusy === s.id}
                        onClick={() => onToggleSr(s.id, !s.is_active)}
                        title={s.is_active ? 'Đang hoạt động — bấm để tắt' : 'Đã tắt — bấm để bật'}
                        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 shrink-0"
                        style={{ background: s.is_active ? '#16a34a' : '#cbd5e1' }}>
                        <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                          style={{ transform: s.is_active ? 'translateX(18px)' : 'translateX(2px)' }} />
                      </button>
                      <button type="button" disabled={srBusy === s.id} onClick={() => setSrEdit(s)}
                        className="text-xs font-medium px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
                        style={{ color: '#004B9B' }}>Sửa</button>
                      <button type="button" disabled={srBusy === s.id} onClick={() => onDeleteSr(s)}
                        className="text-xs font-medium px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
                        style={{ color: '#e11d48' }}>Xoá</button>
                    </div>
                  </div>
                  {/* Thương hiệu showroom đang bán (đọc từ brand_ids) */}
                  {srBrandNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {srBrandNames.map((n) => (
                        <span key={n} className="inline-block text-[11px] font-medium rounded-md px-1.5 py-0.5"
                          style={{ background: '#fff', color: '#004B9B', border: '1px solid #cbd8ea' }}>{n}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1.5">Chưa gán thương hiệu — bấm Sửa để chọn.</p>
                  )}
                </div>
                );
              })}
              {srList.length === 0 && <p className="text-sm text-slate-400">Chưa có showroom.</p>}
            </div>
          </div>
          <div className="pt-1 border-t border-slate-100">
            <label className="flex items-start gap-2.5 px-3 py-2 mt-3 rounded-lg border cursor-pointer"
              style={{ borderColor: b10Enabled ? '#004B9B' : '#e2e8f0', background: b10Enabled ? '#e6f0fa' : '#fff' }}>
              <input type="checkbox" checked={b10Enabled} onChange={(e) => setB10Enabled(e.target.checked)}
                className="mt-0.5 accent-[#004B9B]" />
              <span>
                <span className="block text-sm font-medium text-slate-700">Bật đối soát B10</span>
                <span className="block text-xs text-slate-400">Hiện trang Đối soát, cột B10 trên Lead và chỉ số B10 trong Báo cáo cho công ty này.</span>
              </span>
            </label>
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

    {(srAdding || srEdit) && (
      <ShowroomEditModal
        companyId={company.id}
        grantedBrands={grantedBrands}
        editing={srEdit}
        onClose={() => { setSrAdding(false); setSrEdit(null); }}
        onSaved={async () => { setSrAdding(false); setSrEdit(null); setError(null); await reloadSr(); }}
      />
    )}
    </>
  );
}

function ShowroomEditModal({
  companyId, grantedBrands, editing, onClose, onSaved,
}: {
  companyId: string;
  grantedBrands: PlatformBrand[];
  editing: SrItem | null; // null = tạo mới
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [brandIds, setBrandIds] = useState<string[]>(editing?.brand_ids ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleBrand = (id: string) =>
    setBrandIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError('Nhập tên showroom.'); return; }
    setBusy(true);
    const payload = { name: name.trim(), code: code.trim() || null, brand_ids: brandIds };
    const r = editing
      ? await updateShowroom(companyId, { showroom_id: editing.id, ...payload })
      : await createShowroom(companyId, payload);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? 'Lỗi'); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[410] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{editing ? 'Sửa showroom' : 'Thêm showroom'}</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên showroom</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Showroom Trường Chinh"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mã <span className="text-slate-400 font-normal">(tuỳ chọn)</span></label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="TC"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Thương hiệu tại showroom</label>
            <div className="space-y-1.5">
              {grantedBrands.map((b) => {
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
              {grantedBrands.length === 0 && (
                <p className="text-sm text-slate-400">Công ty chưa được cấp thương hiệu nào. Lưu quota với thương hiệu trước.</p>
              )}
            </div>
          </div>
          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <button onClick={onClose} disabled={busy}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">Hủy</button>
          <button onClick={submit} disabled={busy}
            className="text-sm font-medium px-4 py-2 rounded-lg text-white" style={{ background: '#004B9B' }}>
            {busy ? 'Đang lưu...' : editing ? 'Lưu' : 'Thêm'}
          </button>
        </div>
      </div>
    </div>
  );
}
