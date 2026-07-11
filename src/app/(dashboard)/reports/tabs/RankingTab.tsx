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
import { groupSheet } from '../report-export';

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
      <Panel title="Xep hang">
        <p className="py-8 text-center text-sm text-slate-400">Cap ca nhan khong xep hang.</p>
      </Panel>
    );
  }

  const totals = computeKpis(leads, now);
  const dimLabel = DIMENSION_LABEL[childDim];
  const showContacted = level === 'team';

  const handleExport = () => {
    exportXlsx('xep-hang', [groupSheet(dimLabel, ranked, totals, true)]);
  };

  return (
    <Panel
      title={`Xep hang ${dimLabel}`}
      action={
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-1.5 text-white shadow-sm"
          style={{ background: BRAND }}
        >
          <Download size={15} /> Xuat Excel
        </button>
      }
    >
      {ranked.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">Khong co du lieu trong ky / bo loc.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-2 w-12">Hang</th>
                <th className="py-2 pr-3 sticky left-0 bg-white">{dimLabel}</th>
                <th className="py-2 px-3 text-right">Tong lead</th>
                {showContacted && <th className="py-2 px-3 text-right">Da LH</th>}
                <th className="py-2 px-3 text-right" style={{ color: '#047857' }}>KHD</th>
                <th className="py-2 px-3 text-right" style={{ color: '#047857' }}>%chot</th>
                <th className="py-2 px-3 text-right" style={{ color: '#be123c' }}>Qua han</th>
                <th className="py-2 px-3 text-right">Delta%chot</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, idx) => {
                const rank = idx + 1;
                const chip = RANK_CHIP[rank];
                const declining = r.winRateDelta <= -10;
                return (
                  <tr
                    key={r.key}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                    style={declining ? { background: '#fff1f2' } : undefined}
                  >
                    {/* Hang */}
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
                    {/* Ten */}
                    <td className="py-2 pr-3 sticky left-0 bg-inherit">
                      <span className="text-slate-700 font-medium truncate max-w-[180px] block">{r.label}</span>
                    </td>
                    {/* Tong lead */}
                    <td className="py-2 px-3 text-right font-semibold text-slate-800">{fmt(r.leads)}</td>
                    {/* Da LH (chi khi level=team) */}
                    {showContacted && (
                      <td className="py-2 px-3 text-right" style={{ color: r.contacted === 0 ? '#cbd5e1' : '#1d4ed8' }}>
                        {fmt(r.contacted)}
                      </td>
                    )}
                    {/* KHD */}
                    <td className="py-2 px-3 text-right font-semibold" style={{ color: r.won === 0 ? '#cbd5e1' : '#047857' }}>
                      {fmt(r.won)}
                    </td>
                    {/* %chot */}
                    <td className="py-2 px-3 text-right font-semibold" style={{ color: r.winRate === 0 ? '#cbd5e1' : '#047857' }}>
                      {r.winRate.toFixed(1)}%
                    </td>
                    {/* Qua han */}
                    <td className="py-2 px-3 text-right" style={{ color: r.overdue === 0 ? '#cbd5e1' : '#be123c' }}>
                      {fmt(r.overdue)}
                    </td>
                    {/* Delta%chot */}
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
                <td className="py-2 pr-3 sticky left-0 bg-white">Tong</td>
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
      )}
    </Panel>
  );
}
