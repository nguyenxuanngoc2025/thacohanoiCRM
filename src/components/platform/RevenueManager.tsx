'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ContractRow, ContractTotals, CompanyOption, ContractStatus, PaymentRow, ScheduleRow,
} from './types';

const fmt = (n: number) => n.toLocaleString('vi-VN');

const STATUS_LABEL: Record<ContractStatus, string> = {
  prospect: 'Tiềm năng', active: 'Hiệu lực', expired: 'Hết hạn', churned: 'Đã rời',
};
const STATUS_STYLE: Record<ContractStatus, { bg: string; color: string }> = {
  prospect: { bg: '#f1f5f9', color: '#475569' },
  active: { bg: '#f0fdf4', color: '#166534' },
  expired: { bg: '#fff7ed', color: '#9a3412' },
  churned: { bg: '#fef2f2', color: '#b91c1c' },
};

async function post(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data?.error };
}

export default function RevenueManager({
  contracts, totals, companies,
}: { contracts: ContractRow[]; totals: ContractTotals; companies: CompanyOption[] }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<'all' | ContractStatus>('all');
  const [onlyDebt, setOnlyDebt] = useState(false);
  const [adding, setAdding] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 4000); };

  const rows = contracts.filter((c) =>
    (statusFilter === 'all' || c.status === statusFilter) && (!onlyDebt || c.outstanding > 0));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Tổng giá trị HĐ</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{fmt(totals.totalValue)} đ</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Tổng đã thu</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{fmt(totals.totalPaid)} đ</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-400">Tổng công nợ</p>
          <p className="text-xl font-bold text-rose-600 mt-1">{fmt(totals.totalOutstanding)} đ</p>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ContractStatus)}
            className="text-sm rounded-lg border border-slate-200 px-3 py-2">
            <option value="all">Tất cả trạng thái</option>
            <option value="prospect">Tiềm năng</option>
            <option value="active">Hiệu lực</option>
            <option value="expired">Hết hạn</option>
            <option value="churned">Đã rời</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 px-2 cursor-pointer">
            <input type="checkbox" checked={onlyDebt} onChange={(e) => setOnlyDebt(e.target.checked)} className="accent-brand" />
            Chỉ còn nợ
          </label>
        </div>
        <button onClick={() => setAdding(true)}
          className="text-sm font-medium px-3.5 py-2 rounded-lg text-white" style={{ background: 'var(--color-brand)' }}>
          + Hợp đồng mới
        </button>
      </div>

      {flash && <div className="text-sm bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg px-3 py-2">{flash}</div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Khách / Công ty</th>
              <th className="px-4 py-2.5 font-semibold">Nhãn gói</th>
              <th className="px-4 py-2.5 font-semibold text-right">Giá trị</th>
              <th className="px-4 py-2.5 font-semibold text-right">Đã thu</th>
              <th className="px-4 py-2.5 font-semibold text-right">Còn nợ</th>
              <th className="px-4 py-2.5 font-semibold">Hạn HĐ</th>
              <th className="px-4 py-2.5 font-semibold">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const st = STATUS_STYLE[c.status];
              return (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setDetailId(c.id)}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{c.company_name ?? c.prospect_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{c.plan_label ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{fmt(c.contract_value)}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-600">{fmt(c.paid)}</td>
                  <td className="px-4 py-2.5 text-right font-medium" style={{ color: c.outstanding > 0 ? '#e11d48' : '#64748b' }}>{fmt(c.outstanding)}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {c.expiry_date ?? '—'}
                    {c.overdue && <span className="ml-2 text-xs text-rose-600 font-medium">quá hạn</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block text-xs font-medium rounded-md px-2 py-0.5" style={{ background: st.bg, color: st.color }}>
                      {STATUS_LABEL[c.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Chưa có hợp đồng.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adding && (
        <AddContractModal companies={companies}
          onClose={() => setAdding(false)}
          onDone={(m) => { setAdding(false); flashMsg(m); router.refresh(); }} />
      )}
      {detailId && (
        <ContractDetailModal contractId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={(m) => { flashMsg(m); router.refresh(); }} />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function AddContractModal({
  companies, onClose, onDone,
}: { companies: CompanyOption[]; onClose: () => void; onDone: (m: string) => void }) {
  const [companyId, setCompanyId] = useState('');
  const [prospect, setProspect] = useState('');
  const [planLabel, setPlanLabel] = useState('');
  const [value, setValue] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!companyId && !prospect.trim()) { setError('Chọn công ty hoặc nhập tên khách tiềm năng.'); return; }
    setBusy(true);
    const r = await post('/api/platform/contracts', {
      company_id: companyId || null,
      prospect_name: prospect.trim() || null,
      plan_label: planLabel.trim() || null,
      contract_value: Math.max(0, Number(value) || 0),
      signed_at: signedAt || null,
      term_months: termMonths ? Math.floor(Number(termMonths)) : null,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? 'Lỗi'); return; }
    onDone('Đã tạo hợp đồng.');
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-100"><h3 className="font-bold text-slate-900">Hợp đồng mới</h3></div>
        <div className="p-5 space-y-4">
          <Field label="Công ty (nếu đã onboard)">
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="">— Khách tiềm năng (chưa tạo công ty) —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {!companyId && (
            <Field label="Tên khách tiềm năng">
              <input value={prospect} onChange={(e) => setProspect(e.target.value)} placeholder="Cty TNHH ABC"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </Field>
          )}
          <Field label="Nhãn gói (tùy chọn)">
            <input value={planLabel} onChange={(e) => setPlanLabel(e.target.value)} placeholder="8 showroom"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </Field>
          <Field label="Giá trị hợp đồng (VND)">
            <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" placeholder="120000000"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ngày ký">
              <input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </Field>
            <Field label="Thời hạn (tháng)">
              <input value={termMonths} onChange={(e) => setTermMonths(e.target.value)} inputMode="numeric" placeholder="12"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </Field>
          </div>
          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <button onClick={onClose} disabled={busy} className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">Hủy</button>
          <button onClick={submit} disabled={busy} className="text-sm font-medium px-4 py-2 rounded-lg text-white" style={{ background: 'var(--color-brand)' }}>
            {busy ? 'Đang lưu...' : 'Tạo hợp đồng'}
          </button>
        </div>
      </div>
    </div>
  );
}

type DetailData = {
  contract: ContractRow & { contract_value: number };
  payments: PaymentRow[];
  schedule: ScheduleRow[];
  paid: number;
  outstanding: number;
  overdue: boolean;
};

function ContractDetailModal({
  contractId, onClose, onChanged,
}: { contractId: string; onClose: () => void; onChanged: (m: string) => void }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'none' | 'payment' | 'schedule'>('none');
  // form fields shared
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/platform/contracts/${contractId}`);
    const d = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok || !d) { setError(d?.error ?? 'Không tải được hợp đồng.'); return; }
    setData(d as DetailData);
  }, [contractId]);

  React.useEffect(() => { load(); }, [load]);

  const submitSub = async () => {
    setError(null);
    if (!date || !(Number(amount) > 0)) { setError('Nhập ngày và số tiền (> 0).'); return; }
    setBusy(true);
    const r = mode === 'payment'
      ? await post(`/api/platform/contracts/${contractId}/payments`, { paid_at: date, amount: Number(amount), note: note.trim() || null })
      : await post(`/api/platform/contracts/${contractId}/schedule`, { due_date: date, amount: Number(amount), note: note.trim() || null });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? 'Lỗi'); return; }
    setMode('none'); setDate(''); setAmount(''); setNote('');
    await load();
    onChanged(mode === 'payment' ? 'Đã ghi nhận thu.' : 'Đã thêm đợt dự kiến.');
  };

  const c = data?.contract;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">{c ? (c.company_name ?? c.prospect_name ?? 'Hợp đồng') : 'Hợp đồng'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-5">
          {loading && <p className="text-sm text-slate-400">Đang tải...</p>}
          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
          {data && c && (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">Giá trị</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{fmt(c.contract_value)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">Đã thu</p>
                  <p className="text-sm font-bold text-emerald-600 mt-0.5">{fmt(data.paid)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">Còn nợ</p>
                  <p className="text-sm font-bold text-rose-600 mt-0.5">{fmt(data.outstanding)}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-800">Lịch thu dự kiến</h4>
                  <button onClick={() => { setMode('schedule'); setDate(''); setAmount(''); setNote(''); }}
                    className="text-xs font-medium" style={{ color: 'var(--color-brand)' }}>+ Thêm đợt</button>
                </div>
                {data.schedule.length === 0 ? <p className="text-sm text-slate-400">Chưa có lịch.</p> : (
                  <ul className="space-y-1">
                    {data.schedule.map((s) => (
                      <li key={s.id} className="flex justify-between text-sm border-b border-slate-50 py-1">
                        <span className="text-slate-600">{s.due_date}{s.note ? ` · ${s.note}` : ''}</span>
                        <span className="font-medium text-slate-800">{fmt(Number(s.amount))} đ</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-800">Lịch sử thực nhận</h4>
                  <button onClick={() => { setMode('payment'); setDate(''); setAmount(''); setNote(''); }}
                    className="text-xs font-medium" style={{ color: 'var(--color-brand)' }}>+ Ghi nhận thu</button>
                </div>
                {data.payments.length === 0 ? <p className="text-sm text-slate-400">Chưa có khoản thu.</p> : (
                  <ul className="space-y-1">
                    {data.payments.map((p) => (
                      <li key={p.id} className="flex justify-between text-sm border-b border-slate-50 py-1">
                        <span className="text-slate-600">{p.paid_at}{p.method ? ` · ${p.method}` : ''}{p.note ? ` · ${p.note}` : ''}</span>
                        <span className="font-medium text-emerald-700">{fmt(Number(p.amount))} đ</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {mode !== 'none' && (
                <div className="rounded-lg border border-slate-200 p-3 space-y-3 bg-slate-50">
                  <p className="text-sm font-semibold text-slate-800">
                    {mode === 'payment' ? 'Ghi nhận khoản thu' : 'Thêm đợt thu dự kiến'}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
                    <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="Số tiền"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
                  </div>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'payment' ? 'Ghi chú / phương thức' : 'Ghi chú'}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setMode('none')} disabled={busy}
                      className="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white">Hủy</button>
                    <button onClick={submitSub} disabled={busy}
                      className="text-sm font-medium px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--color-brand)' }}>
                      {busy ? 'Đang lưu...' : 'Lưu'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
