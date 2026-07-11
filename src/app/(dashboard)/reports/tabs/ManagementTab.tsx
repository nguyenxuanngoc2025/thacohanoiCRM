'use client';

import React, { useMemo, useState } from 'react';
import { Download, ChevronRight, ChevronDown } from 'lucide-react';
import {
  groupByDimension,
  computeKpis,
  keyOfDim,
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
    { title: 'Tư vấn bán hàng', dim: 'assignee' },
    { title: 'Dòng xe', dim: 'model' },
  ],
  personal: [],
};

/** Chiều con để mở rộng 1 dòng: showroom→phòng→TVBH; thương hiệu→dòng xe. */
const EXPAND_CHILD: Partial<Record<Dimension, Dimension>> = {
  showroom: 'team',
  team: 'assignee',
  brand: 'model',
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-');
}

/** 8 ô số + 1 ô Δ, dùng chung cho mọi cấp dòng. */
function MetricCells({ r, delta }: { r: GroupRow; delta: number }) {
  return (
    <>
      <td className="py-2 px-3 text-right font-semibold text-slate-800">{fmt(r.leads)}</td>
      <td className="py-2 px-3 text-right" style={{ color: r.contacted === 0 ? '#cbd5e1' : '#1d4ed8' }}>{fmt(r.contacted)}</td>
      <td className="py-2 px-3 text-right" style={{ color: r.interested === 0 ? '#cbd5e1' : '#0891b2' }}>{fmt(r.interested)}</td>
      <td className="py-2 px-3 text-right" style={{ color: r.following === 0 ? '#cbd5e1' : '#b45309' }}>{fmt(r.following)}</td>
      <td className="py-2 px-3 text-right font-semibold" style={{ color: r.won === 0 ? '#cbd5e1' : '#047857' }}>{fmt(r.won)}</td>
      <td className="py-2 px-3 text-right font-semibold" style={{ color: r.winRate === 0 ? '#cbd5e1' : '#047857' }}>{r.winRate.toFixed(1)}%</td>
      <td className="py-2 px-3 text-right" style={{ color: r.overdue === 0 ? '#cbd5e1' : '#be123c' }}>{fmt(r.overdue)}</td>
      <td className="py-2 px-3 text-right"><DeltaArrow delta={delta} pct /></td>
    </>
  );
}

/** Một dòng có thể mở rộng ra cấp con (đệ quy). */
function DrillRow({ row, dim, leads, prevLeads, now, depth }: {
  row: GroupRow;
  dim: Dimension;
  leads: ReportLead[];
  prevLeads: ReportLead[];
  now: number;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const childDim = EXPAND_CHILD[dim];
  const canExpand = !!childDim && row.key !== '__none__';

  const prevByKey = useMemo(
    () => new Map(groupByDimension(prevLeads, dim, now).map((r) => [r.key, r])),
    [prevLeads, dim, now],
  );
  const delta = Math.round((row.winRate - (prevByKey.get(row.key)?.winRate ?? 0)) * 10) / 10;

  const subLeads = useMemo(
    () => (open && childDim ? leads.filter((l) => keyOfDim(l, dim) === row.key) : []),
    [open, childDim, leads, dim, row.key],
  );
  const subPrev = useMemo(
    () => (open && childDim ? prevLeads.filter((l) => keyOfDim(l, dim) === row.key) : []),
    [open, childDim, prevLeads, dim, row.key],
  );

  return (
    <>
      <tr className="border-b border-slate-50 hover:bg-slate-50/60">
        <td className="py-2 pr-3 sticky left-0 bg-inherit" style={{ paddingLeft: 4 + depth * 20 }}>
          <div className="flex items-center gap-1.5">
            {canExpand ? (
              <button
                onClick={() => setOpen((o) => !o)}
                className="shrink-0 text-slate-400 hover:text-slate-700"
                aria-label={open ? 'Thu gọn' : 'Mở rộng'}
              >
                {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
            ) : (
              <span className="shrink-0 inline-block" style={{ width: 15 }} />
            )}
            <span
              className={`truncate max-w-[220px] block ${depth === 0 ? 'text-slate-700 font-medium' : 'text-slate-500'}`}
            >
              {row.label}
            </span>
          </div>
        </td>
        <MetricCells r={row} delta={delta} />
      </tr>
      {open && childDim && (
        <DrillGroup dim={childDim} leads={subLeads} prevLeads={subPrev} now={now} depth={depth + 1} />
      )}
    </>
  );
}

/** Nhóm các dòng của một chiều (top-level hoặc cấp con khi mở rộng). */
function DrillGroup({ dim, leads, prevLeads, now, depth }: {
  dim: Dimension;
  leads: ReportLead[];
  prevLeads: ReportLead[];
  now: number;
  depth: number;
}) {
  const rows = useMemo(() => groupByDimension(leads, dim, now), [leads, dim, now]);
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={9} className="py-2 text-slate-300 text-xs" style={{ paddingLeft: 4 + depth * 20 + 21 }}>
          Không có dữ liệu cấp dưới.
        </td>
      </tr>
    );
  }
  return (
    <>
      {rows.map((r) => (
        <DrillRow key={r.key} row={r} dim={dim} leads={leads} prevLeads={prevLeads} now={now} depth={depth} />
      ))}
    </>
  );
}

interface FixedTableProps {
  title: string;
  dim: Dimension;
  leads: ReportLead[];
  prevLeads: ReportLead[];
  now: number;
  periodLabel: string;
}

function FixedTable({ title, dim, leads, prevLeads, now, periodLabel }: FixedTableProps) {
  const totals = computeKpis(leads, now);
  const dimLabel = DIMENSION_LABEL[dim];
  const expandable = !!EXPAND_CHILD[dim];

  const topRows = useMemo(() => groupByDimension(leads, dim, now), [leads, dim, now]);

  const handleExport = () => {
    const prevByKey = new Map(groupByDimension(prevLeads, dim, now).map((r) => [r.key, r]));
    const rowsWithDelta: RankedRow[] = topRows.map((r) => ({
      ...r,
      winRateDelta: Math.round((r.winRate - (prevByKey.get(r.key)?.winRate ?? 0)) * 10) / 10,
    }));
    const slug = `bao-cao-${dim}-${slugify(periodLabel)}`;
    exportXlsx(slug, [groupSheet(title, rowsWithDelta, totals, true)]);
  };

  return (
    <Panel
      title={title}
      desc={expandable ? 'Bấm ▸ để xem chi tiết cấp dưới' : undefined}
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
      {topRows.length === 0 ? (
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
              <DrillGroup dim={dim} leads={leads} prevLeads={prevLeads} now={now} depth={0} />
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
          leads={leads}
          prevLeads={prevLeads}
          now={now}
          periodLabel={periodLabel}
        />
      ))}
    </div>
  );
}
