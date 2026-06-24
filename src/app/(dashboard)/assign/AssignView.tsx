'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reassignLead, autoDistributeLeads } from '../leads/actions';

export interface UnassignedLead {
  id: string;
  full_name: string | null;
  phone: string;
  source: string | null;
  created_at: string;
  showroom_id: string | null;
  brand_name: string;
  showroom_name: string | null;
}

export interface TvbhLoad {
  id: string;
  full_name: string;
  showroom_id: string | null;
  showroom_name: string | null;
  open_count: number;
}

const NAVY = '#004B9B';

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export default function AssignView({ leads, tvbh }: { leads: UnassignedLead[]; tvbh: TvbhLoad[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 4000); };

  const maxLoad = useMemo(() => Math.max(1, ...tvbh.map((t) => t.open_count)), [tvbh]);

  const assignOne = (leadId: string, tvbhId: string) => {
    if (!tvbhId) return;
    setBusyId(leadId);
    startTransition(async () => {
      const r = await reassignLead(leadId, tvbhId);
      setBusyId(null);
      if (!r.ok) { flashMsg(r.error ?? 'Phân giao thất bại.'); return; }
      const name = tvbh.find((t) => t.id === tvbhId)?.full_name ?? '';
      flashMsg(`Đã giao lead cho ${name}.`);
      router.refresh();
    });
  };

  const autoAll = () => {
    if (leads.length === 0) return;
    if (!window.confirm(`Tự động chia đều ${leads.length} lead chưa giao cho các tư vấn bán hàng?`)) return;
    startTransition(async () => {
      const r = await autoDistributeLeads();
      if (!r.ok) { flashMsg(r.error ?? 'Phân giao thất bại.'); return; }
      flashMsg(`Đã phân giao ${r.assigned} lead${r.skipped ? `, bỏ qua ${r.skipped} lead (không có TVBH phù hợp showroom)` : ''}.`);
      router.refresh();
    });
  };

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      {flash && (
        <div className="shrink-0 px-4 py-2.5 text-sm bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg">
          {flash}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead chưa giao */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0">
          <div className="shrink-0 flex items-center justify-between gap-3 p-5 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Lead chưa giao ({leads.length})</h2>
              <p className="text-xs text-slate-400 mt-0.5">Chọn tư vấn bán hàng cho từng lead, hoặc chia đều tự động.</p>
            </div>
            <button
              onClick={autoAll}
              disabled={pending || leads.length === 0}
              className="shrink-0 text-sm font-semibold text-white rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${NAVY}, #0468BF)` }}
            >
              Tự động chia đều
            </button>
          </div>

          {leads.length === 0 ? (
            <div className="px-5 py-12 text-center text-slate-400 text-sm">Tất cả lead đã có người phụ trách.</div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Khách hàng</th>
                    <th className="px-3 py-2.5 font-semibold">Thương hiệu</th>
                    <th className="px-3 py-2.5 font-semibold">Showroom</th>
                    <th className="px-3 py-2.5 font-semibold">Ngày</th>
                    <th className="px-5 py-2.5 font-semibold text-right">Giao cho</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => {
                    // Ưu tiên TVBH cùng showroom với lead; nếu lead không có showroom thì hiện tất cả
                    const inSr = tvbh.filter((t) => (l.showroom_id ? t.showroom_id === l.showroom_id : true));
                    const opts = inSr.length > 0 ? inSr : tvbh;
                    return (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-5 py-2.5">
                          <div className="font-medium text-slate-800">{l.full_name ?? 'Khách lẻ'}</div>
                          <div className="text-xs text-slate-400">{l.phone}{l.source ? ` · ${l.source}` : ''}</div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{l.brand_name}</td>
                        <td className="px-3 py-2.5 text-slate-600">{l.showroom_name ?? '—'}</td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                        <td className="px-5 py-2.5 text-right">
                          <select
                            defaultValue=""
                            disabled={pending && busyId === l.id}
                            onChange={(e) => assignOne(l.id, e.target.value)}
                            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none focus:border-[#004B9B] disabled:opacity-50 max-w-[180px]"
                          >
                            <option value="">— Chọn TVBH —</option>
                            {opts.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.full_name} ({t.open_count})
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Tải công việc TVBH */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0">
          <div className="shrink-0 p-5 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Tải công việc</h2>
            <p className="text-xs text-slate-400 mt-0.5">Số lead đang mở của mỗi tư vấn bán hàng.</p>
          </div>
          {tvbh.length === 0 ? (
            <p className="text-sm text-slate-400 p-5">Chưa có tư vấn bán hàng nào.</p>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto p-5 pt-3 space-y-2.5">
              {[...tvbh].sort((a, b) => b.open_count - a.open_count).map((t) => (
                <div key={t.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{t.full_name}</span>
                    <span className="text-slate-500">{t.open_count}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(t.open_count / maxLoad) * 100}%`, background: NAVY }} />
                    </div>
                  </div>
                  {t.showroom_name && <div className="text-[11px] text-slate-400 mt-0.5">{t.showroom_name}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
