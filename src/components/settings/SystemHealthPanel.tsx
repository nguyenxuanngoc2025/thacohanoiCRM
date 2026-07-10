'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Loader2 } from 'lucide-react';

type HealthStatus = 'ok' | 'warn' | 'fail';
interface HealthItem { key: string; label: string; status: HealthStatus; detail: string; fix?: string }
interface HealthGroup { title: string; items: HealthItem[] }
interface SystemHealth { overall: HealthStatus; groups: HealthGroup[]; generatedAt: string }

const STYLE: Record<HealthStatus, { color: string; bg: string; border: string; label: string; Icon: React.ElementType }> = {
  ok: { color: '#166534', bg: '#f0fdf4', border: '#86efac', label: 'Bình thường', Icon: CheckCircle2 },
  warn: { color: '#92400e', bg: '#fffbeb', border: '#fde68a', label: 'Cần chú ý', Icon: AlertTriangle },
  fail: { color: '#991b1b', bg: '#fef2f2', border: '#fecaca', label: 'Có lỗi', Icon: XCircle },
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch { return iso; }
}

export default function SystemHealthPanel() {
  const [data, setData] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/system-health', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Không tải được tình trạng hệ thống.');
      setData(j as SystemHealth);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const overall = data?.overall ?? 'ok';
  const ov = STYLE[overall];

  return (
    <div className="space-y-4">
      {/* Tiêu đề + nút làm mới */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Tình trạng hệ thống</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi luồng thu lead (Facebook, quét tự động, bot Zalo). Đèn xanh là tốt, đỏ là cần xử lý.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Làm mới
        </button>
      </div>

      {/* Băng tổng quan */}
      {data && (
        <div
          className="flex items-center gap-3 rounded-xl border px-4 py-3"
          style={{ background: ov.bg, borderColor: ov.border }}
        >
          <ov.Icon size={22} style={{ color: ov.color }} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold" style={{ color: ov.color }}>
              {overall === 'ok' ? 'Toàn hệ thống bình thường' : overall === 'warn' ? 'Có mục cần chú ý' : 'Có lỗi cần xử lý'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Cập nhật: {fmtTime(data.generatedAt)}</div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
          <Loader2 size={16} className="animate-spin" /> Đang kiểm tra…
        </div>
      )}

      {/* Các nhóm */}
      {data?.groups.map((g) => (
        <div key={g.title} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 text-xs font-bold uppercase tracking-wide text-slate-500">
            {g.title}
          </div>
          <div className="divide-y divide-slate-100">
            {g.items.map((it) => {
              const s = STYLE[it.status];
              return (
                <div key={it.key} className="px-4 py-3 flex items-start gap-3">
                  <s.Icon size={18} style={{ color: s.color }} className="shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{it.label}</span>
                      <span
                        className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
                      >
                        {s.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">{it.detail}</div>
                    {it.fix && (
                      <div
                        className="text-xs mt-1.5 rounded-lg px-2.5 py-2"
                        style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
                      >
                        <span className="font-semibold">Cách xử lý: </span>{it.fix}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
