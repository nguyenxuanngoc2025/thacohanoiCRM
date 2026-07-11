'use client';

import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import {
  rankChildren, childDimension, computeKpis,
  DIMENSION_LABEL,
  type ReportLead, type ReportLevel,
} from '@/lib/reports';
import { exportXlsx } from '@/lib/xlsx-export';
import { Panel, BRAND, fmt, DeltaArrow } from '../ui';
import { tableSheet, type SheetCol } from '../report-export';

// Rank chip colours: gold / silver / bronze / plain
const RANK_CHIP: Record<number, { bg: string; color: string; label: string }> = {
  1: { bg: '#fef3c7', color: '#92400e', label: 'TOP 1' },
  2: { bg: '#f1f5f9', color: '#475569', label: 'TOP 2' },
  3: { bg: '#fef0e6', color: '#92400e', label: 'TOP 3' },
};

export default function RankingTab({
  leads, prevLeads, level, showB10: _showB10,
}: {
  leads: ReportLead[];
  prevLeads: ReportLead[];
  level: ReportLevel;
  showB10: boolean;
}) {
  const now = useMemo(() => Date.now(), []);
  const ranked = useMemo(() => rankChildren(leads, prevLeads, level, now), [leads, prevLeads, level, now]);
  const childDim = useMemo(() => childDimension(level), [level]);

  if (childDim === null) {
    return (
      <Panel title="Xếp hạng">
        <p className="py-8 text-center text-sm text-slate-400">Cấp cá nhân không xếp hạng.</p>
      </Panel>
    );
  }

  const totals = computeKpis(leads, now);
  const dimLabel = DIMENSION_LABEL[childDim];
  const showContacted = level === 'team';

  type RankedWithIndex = (typeof ranked)[number] & { rank: number };
  const rankedWithIndex: RankedWithIndex[] = ranked.map((r, i) => ({ ...r, rank: i + 1 }));

  const handleExport = () => {
    const cols: SheetCol<RankedWithIndex>[] = [
      { header: 'Hạng', value: (r) => r.rank },
      { header: dimLabel, value: (r) => r.label },
      { header: 'Tổng lead', value: (r) => r.leads },
      ...(showContacted ? [{ header: 'Đã LH', value: (r: RankedWithIndex) => r.contacted }] : []),
      { header: 'KHĐ', value: (r) => r.won },
      { header: 'Tỉ lệ chốt (%)', value: (r) => r.winRate },
      { header: 'Quá hạn', value: (r) => r.overdue },
      { header: 'Δ%chốt', value: (r) => r.winRateDelta },
    ];
    exportXlsx('xep-hang', [tableSheet(dimLabel, cols, rankedWithIndex)]);
  };

  return (
    <Panel
      title={`Xếp hạng ${dimLabel}`}
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
      {ranked.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">Không có dữ liệu trong kỳ / bộ lọc.</div>
      ) : (
        <><div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-2 w-12">Hạng</th>
                <th className="py-2 pr-3 sticky left-0 bg-white">{dimLabel}</th>
                <th className="py-2 px-3 text-right">Tổng lead</th>
                {showContacted && <th className="py-2 px-3 text-right">Đã LH</th>}
                <th className="py-2 px-3 text-right" style={{ color: '#047857' }}>KHĐ</th>
                <th className="py-2 px-3 text-right" style={{ color: '#047857' }}>%chốt</th>
                <th className="py-2 px-3 text-right" style={{ color: '#be123c' }}>Quá hạn</th>
                <th className="py-2 px-3 text-right">Δ%chốt</th>
              </tr>
            </thead>
            <tbody>
              {rankedWithIndex.map((r) => {
                const rank = r.rank;
                const chip = RANK_CHIP[rank];
                const declining = r.winRateDelta <= -10;
                return (
                  <tr
                    key={r.key}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                    style={declining ? { background: '#fff1f2' } : undefined}
                  >
                    {/* Hạng */}
                    <td className="py-2 pr-2">
                      {chip ? (
                        <span
                          className="inline-flex items-center justify-center text-[11px] font-bold rounded px-1.5 py-0.5"
                          style={{ background: chip.bg, color: chip.color }}
                        >
                          {chip.label}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs font-medium">{rank}</span>
                      )}
                    </td>
                    {/* Tên */}
                    <td className="py-2 pr-3 sticky left-0 bg-inherit">
                      <span className="text-slate-700 font-medium truncate max-w-[180px] block">{r.label}</span>
                    </td>
                    {/* Tổng lead */}
                    <td className="py-2 px-3 text-right font-semibold text-slate-800">{fmt(r.leads)}</td>
                    {/* Đã LH (chỉ khi level=team) */}
                    {showContacted && (
                      <td className="py-2 px-3 text-right" style={{ color: r.contacted === 0 ? '#cbd5e1' : '#1d4ed8' }}>
                        {fmt(r.contacted)}
                      </td>
                    )}
                    {/* KHĐ */}
                    <td className="py-2 px-3 text-right font-semibold" style={{ color: r.won === 0 ? '#cbd5e1' : '#047857' }}>
                      {fmt(r.won)}
                    </td>
                    {/* %chốt */}
                    <td className="py-2 px-3 text-right font-semibold" style={{ color: r.winRate === 0 ? '#cbd5e1' : '#047857' }}>
                      {r.winRate.toFixed(1)}%
                    </td>
                    {/* Quá hạn */}
                    <td className="py-2 px-3 text-right" style={{ color: r.overdue === 0 ? '#cbd5e1' : '#be123c' }}>
                      {fmt(r.overdue)}
                    </td>
                    {/* Δ%chốt */}
                    <td className="py-2 px-3 text-right">
                      <DeltaArrow delta={r.winRateDelta} pct />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 text-slate-800 font-semibold">
                <td className="py-2 pr-2" />
                <td className="py-2 pr-3 sticky left-0 bg-white">Tổng</td>
                <td className="py-2 px-3 text-right">{fmt(totals.total)}</td>
                {showContacted && <td className="py-2 px-3 text-right" style={{ color: '#1d4ed8' }}>{fmt(totals.contacted)}</td>}
                <td className="py-2 px-3 text-right" style={{ color: '#047857' }}>{fmt(totals.won)}</td>
                <td className="py-2 px-3 text-right" style={{ color: '#047857' }}>{totals.winRate}%</td>
                <td className="py-2 px-3 text-right" style={{ color: '#be123c' }}>{fmt(totals.overdue)}</td>
                <td className="py-2 px-3 text-right" />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Card view mobile */}
        <div className="sm:hidden space-y-2">
          {rankedWithIndex.map((r) => {
            const chip = RANK_CHIP[r.rank];
            const declining = r.winRateDelta <= -10;
            return (
              <div key={r.key} className="rounded-lg border border-slate-100 p-3"
                style={declining ? { background: '#fff1f2' } : { background: '#fff' }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {chip ? (
                      <span className="inline-flex items-center justify-center text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0"
                        style={{ background: chip.bg, color: chip.color }}>{chip.label}</span>
                    ) : (
                      <span className="text-slate-400 text-xs font-medium shrink-0">#{r.rank}</span>
                    )}
                    <span className="text-slate-800 font-semibold truncate">{r.label}</span>
                  </div>
                  <DeltaArrow delta={r.winRateDelta} pct />
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-[13px]">
                  <CardStat label="Tổng lead" value={fmt(r.leads)} />
                  {showContacted && <CardStat label="Đã LH" value={fmt(r.contacted)} color={r.contacted === 0 ? '#cbd5e1' : '#1d4ed8'} />}
                  <CardStat label="KHĐ" value={fmt(r.won)} color={r.won === 0 ? '#cbd5e1' : '#047857'} />
                  <CardStat label="%chốt" value={`${r.winRate.toFixed(1)}%`} color={r.winRate === 0 ? '#cbd5e1' : '#047857'} />
                  <CardStat label="Quá hạn" value={fmt(r.overdue)} color={r.overdue === 0 ? '#cbd5e1' : '#be123c'} />
                </div>
              </div>
            );
          })}
          <div className="rounded-lg border-2 border-slate-200 p-3">
            <div className="text-slate-800 font-semibold mb-2">Tổng</div>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-[13px]">
              <CardStat label="Tổng lead" value={fmt(totals.total)} />
              {showContacted && <CardStat label="Đã LH" value={fmt(totals.contacted)} color="#1d4ed8" />}
              <CardStat label="KHĐ" value={fmt(totals.won)} color="#047857" />
              <CardStat label="%chốt" value={`${totals.winRate}%`} color="#047857" />
              <CardStat label="Quá hạn" value={fmt(totals.overdue)} color="#be123c" />
            </div>
          </div>
        </div></>
      )}
    </Panel>
  );
}

function CardStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold" style={{ color: color ?? '#1e293b' }}>{value}</span>
    </div>
  );
}
