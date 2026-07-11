'use client';

import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import {
  groupByDimension,
  computeKpis,
  DIMENSION_LABEL,
  type ReportLead,
  type ReportLevel,
  type GroupRow,
  type RankedRow,
  type Dimension,
} from '@/lib/reports';
import { Panel, BRAND, fmt, DeltaArrow } from '../ui';
import { exportXlsx } from '@/lib/xlsx-export';
import { groupSheet } from '../report-export';

// Per-level table config
type TableConfig = { title: string; dim: Dimension };

const LEVEL_TABLES: Record<ReportLevel, TableConfig[]> = {
  company: [
    { title: 'Danh sách Showroom', dim: 'showroom' },
    { title: 'Danh sách Thương hiệu', dim: 'brand' },
  ],
  brand: [
    { title: 'Showroom', dim: 'showroom' },
    { title: 'Dòng xe', dim: 'model' },
  ],
  showroom: [
    { title: 'Phòng bán hàng', dim: 'team' },
    { title: 'Thương hiệu', dim: 'brand' },
    { title: 'Dòng xe', dim: 'model' },
  ],
  team: [
    { title: 'Tu van ban hang', dim: 'assignee' },
    { title: 'Dòng xe', dim: 'model' },
  ],
  personal: [],
};

// Fix team label (uses Vietnamese characters properly)
LEVEL_TABLES.team[0].title = 'Tư vấn bán hàng';

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-');
}

interface FixedTableProps {
  title: string;
  dim: Dimension;
  rows: GroupRow[];
  prevByKey: Map<string, GroupRow>;
  leads: ReportLead[];
  now: number;
  periodLabel: string;
}

function FixedTable({ title, dim, rows, prevByKey, leads, now, periodLabel }: FixedTableProps) {
  const totals = computeKpis(leads, now);
  const dimLabel = DIMENSION_LABEL[dim];

  const rowsWithDelta: RankedRow[] = rows.map((r) => {
    const prev = prevByKey.get(r.key);
    const delta = Math.round((r.winRate - (prev?.winRate ?? 0)) * 10) / 10;
    return { ...r, winRateDelta: delta };
  });

  const handleExport = () => {
    const slug = `bao-cao-${dim}-${slugify(periodLabel)}`;
    exportXlsx(slug, [groupSheet(title, rowsWithDelta, totals, true)]);
  };

  return (
    <Panel
      title={title}
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
      {rows.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">
          Không có dữ liệu trong kỳ / bộ lọc.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-3 sticky left-0 bg-white">{dimLabel}</th>
                <th className="py-2 px-3 text-right">Tổng lead</th>
                <th className="py-2 px-3 text-right">Đã LH</th>
                <th className="py-2 px-3 text-right" style={{ color: '#0891b2' }}>KHQT</th>
                <th className="py-2 px-3 text-right" style={{ color: '#b45309' }}>GDTD</th>
                <th className="py-2 px-3 text-right" style={{ color: '#047857' }}>KHĐ</th>
                <th className="py-2 px-3 text-right" style={{ color: '#047857' }}>%chốt</th>
                <th className="py-2 px-3 text-right" style={{ color: '#be123c' }}>Quá hạn</th>
                <th className="py-2 px-3 text-right">Δ so kỳ trước</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithDelta.map((r) => (
                <tr
                  key={r.key}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                >
                  <td className="py-2 pr-3 sticky left-0 bg-inherit">
                    <span className="text-slate-700 font-medium truncate max-w-[200px] block">{r.label}</span>
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-slate-800">{fmt(r.leads)}</td>
                  <td className="py-2 px-3 text-right" style={{ color: r.contacted === 0 ? '#cbd5e1' : '#1d4ed8' }}>
                    {fmt(r.contacted)}
                  </td>
                  <td className="py-2 px-3 text-right" style={{ color: r.interested === 0 ? '#cbd5e1' : '#0891b2' }}>
                    {fmt(r.interested)}
                  </td>
                  <td className="py-2 px-3 text-right" style={{ color: r.following === 0 ? '#cbd5e1' : '#b45309' }}>
                    {fmt(r.following)}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold" style={{ color: r.won === 0 ? '#cbd5e1' : '#047857' }}>
                    {fmt(r.won)}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold" style={{ color: r.winRate === 0 ? '#cbd5e1' : '#047857' }}>
                    {r.winRate.toFixed(1)}%
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
                <td className="py-2 px-3 text-right" style={{ color: '#1d4ed8' }}>{fmt(totals.contacted)}</td>
                <td className="py-2 px-3 text-right" style={{ color: '#0891b2' }}>{fmt(totals.interested)}</td>
                <td className="py-2 px-3 text-right" style={{ color: '#b45309' }}>{fmt(totals.following)}</td>
                <td className="py-2 px-3 text-right" style={{ color: '#047857' }}>{fmt(totals.won)}</td>
                <td className="py-2 px-3 text-right" style={{ color: '#047857' }}>{totals.winRate.toFixed(1)}%</td>
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

export default function ManagementTab({
  leads,
  prevLeads,
  level,
  showB10: _showB10,
  periodLabel,
}: {
  leads: ReportLead[];
  prevLeads: ReportLead[];
  level: ReportLevel;
  showB10: boolean;
  periodLabel: string;
}) {
  const now = useMemo(() => Date.now(), []);
  const tables = LEVEL_TABLES[level];

  // Pre-compute previous period rows for each dim — keyed by dim for memo
  const prevMaps = useMemo(() => {
    const result = new Map<Dimension, Map<string, GroupRow>>();
    for (const { dim } of tables) {
      if (!result.has(dim)) {
        const prevRows = groupByDimension(prevLeads, dim, now);
        result.set(dim, new Map(prevRows.map((r) => [r.key, r])));
      }
    }
    return result;
  }, [prevLeads, tables, now]);

  const currentRows = useMemo(() => {
    const result = new Map<Dimension, GroupRow[]>();
    for (const { dim } of tables) {
      if (!result.has(dim)) {
        result.set(dim, groupByDimension(leads, dim, now));
      }
    }
    return result;
  }, [leads, tables, now]);

  if (tables.length === 0) {
    return (
      <Panel title="Bảng quản trị">
        <p className="py-8 text-center text-sm text-slate-400">
          Cấp cá nhân không có bảng quản trị.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      {tables.map(({ title, dim }) => (
        <FixedTable
          key={dim}
          title={title}
          dim={dim}
          rows={currentRows.get(dim) ?? []}
          prevByKey={prevMaps.get(dim) ?? new Map()}
          leads={leads}
          now={now}
          periodLabel={periodLabel}
        />
      ))}
    </div>
  );
}
