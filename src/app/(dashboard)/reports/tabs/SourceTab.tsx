'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Download } from 'lucide-react';
import {
  sourceQuality, groupBySource, groupByModel, computeKpis, dailyTrend,
  type ReportLead,
} from '@/lib/reports';
import { exportXlsx } from '@/lib/xlsx-export';
import { Panel, PALETTE, BRAND, fmt, DeltaArrow } from '../ui';
import { tableSheet, type SheetCol } from '../report-export';

const AXIS = { fontSize: 11, fill: '#94a3b8' };

function box(children: React.ReactNode) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', padding: '8px 10px', fontSize: 12 }}>
      {children}
    </div>
  );
}

interface TipPayload { name: string; value: number }

function TipGeneric({ active, payload, label }: { active?: boolean; payload?: TipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return box(
    <>
      {label && <div className="font-semibold text-slate-700 mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="text-slate-600">{p.name}: <b className="text-slate-800">{fmt(p.value)}</b></div>
      ))}
    </>,
  );
}

function TipWithWinRate({ active, payload, label }: { active?: boolean; payload?: (TipPayload & { payload?: { winRate?: number } })[], label?: string }) {
  if (!active || !payload?.length) return null;
  const winRate = payload[0]?.payload?.winRate;
  return box(
    <>
      {label && <div className="font-semibold text-slate-700 mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="text-slate-600">{p.name}: <b className="text-slate-800">{fmt(p.value)}</b></div>
      ))}
      {winRate != null && <div className="text-slate-500 mt-1">Tỉ lệ chốt: <b className="text-emerald-700">{winRate.toFixed(1)}%</b></div>}
    </>,
  );
}

export default function SourceTab({
  leads, prevLeads, fromMs, toMs, showB10: _showB10,
}: {
  leads: ReportLead[];
  prevLeads: ReportLead[];
  fromMs: number;
  toMs: number;
  showB10: boolean;
}) {
  const now = Date.now();

  const quality = useMemo(() => sourceQuality(leads, prevLeads, now), [leads, prevLeads]);
  const bySource = useMemo(() => groupBySource(leads, now), [leads]);
  const byModel = useMemo(() => groupByModel(leads, now), [leads]);
  const trend = useMemo(() => dailyTrend(leads, fromMs, toMs), [leads, fromMs, toMs]);

  const totals = useMemo(() => computeKpis(leads, now), [leads]);

  const sourceBarData = bySource.slice(0, 8).map((r) => ({ name: r.label, lead: r.leads, chot: r.won }));
  const modelBarData = byModel.slice(0, 10).map((r) => ({ name: r.label, lead: r.leads, chot: r.won, winRate: r.winRate }));
  const trendData = trend.map((d) => ({ date: d.date.slice(5), count: d.count }));

  const handleExport = () => {
    type QualityRow = (typeof quality)[number];
    const cols: SheetCol<QualityRow>[] = [
      { header: 'Nguồn', value: (r) => r.label },
      { header: 'Tổng lead', value: (r) => r.leads },
      { header: '%chốt', value: (r) => r.winRate },
      { header: 'KHĐ', value: (r) => r.won },
      { header: 'Quá hạn', value: (r) => r.overdue },
      { header: 'Δ%chốt', value: (r) => r.winRateDelta },
    ];
    exportXlsx('nguon-kenh', [tableSheet('Chất lượng nguồn', cols, quality)]);
  };

  return (
    <div className="space-y-5">
      {/* Chất lượng nguồn — bảng chính */}
      <Panel
        title="Chất lượng nguồn"
        desc="Xếp hạng theo tỉ lệ chốt — nguồn chất lượng = tỉ lệ cao hơn"
        action={
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-1.5 text-white shadow-sm"
            style={{ background: BRAND }}
          >
            <Download size={15} /> Xuất Excel
          </button>
        }
      >
        {quality.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">Không có dữ liệu trong kỳ / bộ lọc.</div>
        ) : (
          <><div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-3 sticky left-0 bg-white">Nguồn</th>
                  <th className="py-2 px-3 text-right">Tổng lead</th>
                  <th className="py-2 px-3 text-right" style={{ color: '#047857' }}>%chốt</th>
                  <th className="py-2 px-3 text-right" style={{ color: '#047857' }}>KHĐ</th>
                  <th className="py-2 px-3 text-right" style={{ color: '#be123c' }}>Quá hạn</th>
                  <th className="py-2 px-3 text-right">Δ%chốt</th>
                </tr>
              </thead>
              <tbody>
                {quality.map((r) => (
                  <tr key={r.key} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="py-2 pr-3 sticky left-0 bg-inherit">
                      <span className="text-slate-700 font-medium truncate max-w-[200px] block">{r.label}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-800">{fmt(r.leads)}</td>
                    <td className="py-2 px-3 text-right font-semibold" style={{ color: r.winRate === 0 ? '#cbd5e1' : '#047857' }}>
                      {r.winRate.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right font-semibold" style={{ color: r.won === 0 ? '#cbd5e1' : '#047857' }}>
                      {fmt(r.won)}
                    </td>
                    <td className="py-2 px-3 text-right" style={{ color: r.overdue === 0 ? '#cbd5e1' : '#be123c' }}>
                      {fmt(r.overdue)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <DeltaArrow delta={r.winRateDelta} pct />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 text-slate-800 font-semibold">
                  <td className="py-2 pr-3 sticky left-0 bg-white">Tổng</td>
                  <td className="py-2 px-3 text-right">{fmt(totals.total)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: '#047857' }}>{totals.winRate}%</td>
                  <td className="py-2 px-3 text-right" style={{ color: '#047857' }}>{fmt(totals.won)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: '#be123c' }}>{fmt(totals.overdue)}</td>
                  <td className="py-2 px-3 text-right" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Card view mobile */}
          <div className="sm:hidden space-y-2">
            {quality.map((r) => (
              <div key={r.key} className="rounded-lg border border-slate-100 bg-white p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-slate-800 font-semibold truncate">{r.label}</span>
                  <DeltaArrow delta={r.winRateDelta} pct />
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-[13px]">
                  <SrcStat label="Tổng lead" value={fmt(r.leads)} />
                  <SrcStat label="%chốt" value={`${r.winRate.toFixed(1)}%`} color={r.winRate === 0 ? '#cbd5e1' : '#047857'} />
                  <SrcStat label="KHĐ" value={fmt(r.won)} color={r.won === 0 ? '#cbd5e1' : '#047857'} />
                  <SrcStat label="Quá hạn" value={fmt(r.overdue)} color={r.overdue === 0 ? '#cbd5e1' : '#be123c'} />
                </div>
              </div>
            ))}
            <div className="rounded-lg border-2 border-slate-200 p-3">
              <div className="text-slate-800 font-semibold mb-2">Tổng</div>
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-[13px]">
                <SrcStat label="Tổng lead" value={fmt(totals.total)} />
                <SrcStat label="%chốt" value={`${totals.winRate}%`} color="#047857" />
                <SrcStat label="KHĐ" value={fmt(totals.won)} color="#047857" />
                <SrcStat label="Quá hạn" value={fmt(totals.overdue)} color="#be123c" />
              </div>
            </div>
          </div></>
        )}
      </Panel>

      {/* Lead & hợp đồng theo nguồn — bar chart */}
      <Panel title="Lead & hợp đồng theo nguồn" desc="So sánh số lead và số ký HĐ từng kênh">
        <div style={{ height: Math.max(220, sourceBarData.length * 42) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sourceBarData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barCategoryGap={14}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={110} />
              <Tooltip content={<TipGeneric />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="lead" name="Lead" fill={BRAND} radius={[0, 4, 4, 0]} />
              <Bar dataKey="chot" name="Đã chốt" fill="#0d9488" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* Xu hướng lead theo ngày — area chart */}
      <Panel
        title="Xu hướng lead theo ngày"
        desc={`Tổng ${fmt(trend.reduce((s, d) => s + d.count, 0))} lead — phân tách theo nguồn là cải tiến sau`}
      >
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSourceLead" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
              <Tooltip content={<TipGeneric />} />
              <Area type="monotone" dataKey="count" name="Lead" stroke={BRAND} strokeWidth={2} fill="url(#gradSourceLead)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* Dòng xe hút khách */}
      {modelBarData.length > 0 && (
        <Panel title="Dòng xe hút khách" desc="Top dòng xe theo số lead (tooltip: tỉ lệ chốt)">
          <div style={{ height: Math.max(220, modelBarData.length * 42) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelBarData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barCategoryGap={14}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={150} />
                <Tooltip content={<TipWithWinRate />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="lead" name="Lead" fill={PALETTE[0]} radius={[0, 4, 4, 0]} />
                <Bar dataKey="chot" name="Đã chốt" fill={PALETTE[3]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}
    </div>
  );
}

function SrcStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold" style={{ color: color ?? '#1e293b' }}>{value}</span>
    </div>
  );
}
