'use client';

import React, { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Download, Check } from 'lucide-react';
import {
  computeKpis, groupByDimension, crossDimension,
  DIMENSION_LABEL, type Dimension, type GroupRow, type ReportLead, type Pivot,
} from '@/lib/reports';
import type { SourceCatalog } from '@/lib/source';
import { exportXlsx, type SheetData } from '@/lib/xlsx-export';
import { Panel, Dropdown, BRAND, fmt, type Opt } from './ui';

type MetricKey = 'leads' | 'share' | 'contacted' | 'contactRate' | 'interested' | 'following' | 'won' | 'winRate' | 'fail' | 'failRate' | 'overdue' | 'b10On' | 'b10Rate' | 'b10Interested' | 'b10Following' | 'b10Won' | 'b10Loai';

interface MetricCol { key: MetricKey; label: string; pct?: boolean; tone?: string }

// Cột bám đúng phễu phân loại khách hàng: Đã LH → KHQT → GDTD → KHĐ → Loại.
const METRICS: MetricCol[] = [
  { key: 'leads', label: 'Lead' },
  { key: 'share', label: 'Tỉ trọng', pct: true },
  { key: 'contacted', label: 'Đã LH' },
  { key: 'contactRate', label: 'Tỉ lệ LH', pct: true },
  { key: 'interested', label: 'KHQT', tone: '#1d4ed8' },
  { key: 'following', label: 'GDTD', tone: '#b45309' },
  { key: 'won', label: 'KHĐ', tone: '#047857' },
  { key: 'winRate', label: 'Tỉ lệ chốt', pct: true, tone: '#047857' },
  { key: 'fail', label: 'Loại', tone: '#be123c' },
  { key: 'failRate', label: 'Tỉ lệ loại', pct: true, tone: '#be123c' },
  { key: 'overdue', label: 'Quá hạn', tone: '#be123c' },
];

// Cột đối soát B10 — chỉ hiện khi công ty bật b10_enabled.
const B10_METRICS: MetricCol[] = [
  { key: 'b10On', label: 'Lên B10', tone: '#0369a1' },
  { key: 'b10Rate', label: '% B10', pct: true, tone: '#0369a1' },
  { key: 'b10Interested', label: 'KHQT·B10', tone: '#1d4ed8' },
  { key: 'b10Following', label: 'GDTD·B10', tone: '#b45309' },
  { key: 'b10Won', label: 'KHĐ·B10', tone: '#047857' },
  { key: 'b10Loai', label: 'Loại·B10', tone: '#be123c' },
];

export default function TablesTab({ leads, showB10, dims, sourceCatalog }: { leads: ReportLead[]; showB10: boolean; dims: Dimension[]; sourceCatalog: SourceCatalog }) {
  const nowMs = useMemo(() => Date.now(), []);
  const [rowDim, setRowDim] = useState<Dimension>(() => dims[0]);
  const [colDim, setColDim] = useState<string>(''); // '' = không tách cột (bảng phẳng)

  // Nếu cấp báo cáo thay đổi và rowDim hiện tại không còn hợp lệ, reset về dims[0].
  const safeRowDim = dims.includes(rowDim) ? rowDim : dims[0];
  React.useEffect(() => {
    if (!dims.includes(rowDim)) {
      setRowDim(dims[0]);
      setColDim('');
    }
  }, [dims, rowDim]);

  const dimOpts: Opt[] = dims.map((d) => ({ value: d, label: DIMENSION_LABEL[d] }));
  const [hidden, setHidden] = useState<Set<MetricKey>>(new Set());
  const [sortKey, setSortKey] = useState<MetricKey>('leads');
  const [asc, setAsc] = useState(false);

  const totals = useMemo(() => computeKpis(leads, nowMs), [leads, nowMs]);
  const flatRows = useMemo(() => groupByDimension(leads, safeRowDim, nowMs, sourceCatalog), [leads, safeRowDim, nowMs, sourceCatalog]);
  const pivot = useMemo<Pivot | null>(
    () => (colDim ? crossDimension(leads, safeRowDim, colDim as Dimension, sourceCatalog) : null),
    [leads, safeRowDim, colDim, sourceCatalog],
  );

  const allMetrics = useMemo(() => (showB10 ? [...METRICS, ...B10_METRICS] : METRICS), [showB10]);
  const visible = allMetrics.filter((m) => !hidden.has(m.key));
  const toggle = (k: MetricKey) => setHidden((s) => {
    const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n;
  });

  // Cột tách: mọi chiều khác chiều hàng.
  const colOpts = dimOpts.filter((o) => o.value !== safeRowDim);
  const onRowDim = (d: string) => { setRowDim(d as Dimension); if (d === colDim) setColDim(''); };

  const handleExport = () => exportXlsx('bao-cao-lead', buildSheets(leads, nowMs, safeRowDim, colDim, showB10, dims, sourceCatalog));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Field label="Nhóm theo">
            <Dropdown value={safeRowDim} onChange={onRowDim} placeholder="Chọn" options={dimOpts} allowClear={false} />
          </Field>
          <Field label="Tách cột">
            <Dropdown value={colDim} onChange={setColDim} placeholder="Không tách" options={colOpts} />
          </Field>
          <button onClick={handleExport}
            className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-1.5 text-white shadow-sm"
            style={{ background: BRAND }}>
            <Download size={15} /> Xuất Excel
          </button>
        </div>
        {!colDim && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mr-1">Hiện cột</span>
            {allMetrics.map((m) => {
              const on = !hidden.has(m.key);
              return (
                <button key={m.key} onClick={() => toggle(m.key)}
                  className="inline-flex items-center gap-1 text-xs rounded-full border px-2 py-0.5 transition-colors"
                  style={on
                    ? { borderColor: BRAND, background: '#e6f0fa', color: BRAND, fontWeight: 600 }
                    : { borderColor: '#e2e8f0', background: '#fff', color: '#94a3b8' }}>
                  {on && <Check size={11} />} {m.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Panel
        title={colDim
          ? `${DIMENSION_LABEL[safeRowDim]} × ${DIMENSION_LABEL[colDim as Dimension]}`
          : `Bảng chỉ số theo ${DIMENSION_LABEL[safeRowDim].toLowerCase()}`}
        desc={colDim ? 'Mỗi ô: số lead · số ký HĐ' : 'Bấm tiêu đề cột để sắp xếp · bật/tắt cột ở trên'}
      >
        {leads.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">Không có lead trong kỳ / bộ lọc.</div>
        ) : pivot ? (
          <PivotTable pivot={pivot} rowLabel={DIMENSION_LABEL[safeRowDim]} />
        ) : (
          <FlatTable
            rows={flatRows} cols={visible} firstCol={DIMENSION_LABEL[safeRowDim]} totals={totals}
            sortKey={sortKey} asc={asc}
            onSort={(k) => { if (k === sortKey) setAsc((v) => !v); else { setSortKey(k); setAsc(false); } }}
          />
        )}
      </Panel>

      <p className="text-xs text-slate-400">
        Nút <b>Xuất Excel</b> tạo file .xlsx gồm bảng đang xem + 1 sheet cho mỗi chiều ({dims.map((d) => DIMENSION_LABEL[d]).join(', ')}).
      </p>
    </div>
  );
}

// ─── Bảng phẳng (chỉ số) ─────────────────────────────────────────────────────

function FlatTable({ rows, cols, firstCol, totals, sortKey, asc, onSort }: {
  rows: GroupRow[]; cols: MetricCol[]; firstCol: string;
  totals: ReturnType<typeof computeKpis>; sortKey: MetricKey; asc: boolean; onSort: (k: MetricKey) => void;
}) {
  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => (asc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
    return arr;
  }, [rows, sortKey, asc]);
  const maxLeads = Math.max(1, ...rows.map((r) => r.leads));
  const totalVal = (k: MetricKey): number | string => {
    switch (k) {
      case 'leads': return totals.total;
      case 'share': return '100%';
      case 'contacted': return totals.contacted;
      case 'contactRate': return `${totals.contactRate}%`;
      case 'interested': return totals.interested;
      case 'following': return totals.following;
      case 'won': return totals.won;
      case 'winRate': return `${totals.winRate}%`;
      case 'fail': return totals.fail;
      case 'failRate': return `${totals.failRate}%`;
      case 'overdue': return totals.overdue;
      case 'b10On': return totals.b10On;
      case 'b10Rate': return `${totals.b10Rate}%`;
      case 'b10Interested': return totals.b10Interested;
      case 'b10Following': return totals.b10Following;
      case 'b10Won': return totals.b10Won;
      case 'b10Loai': return totals.b10Loai;
    }
  };
  const cell = (v: number, pct?: boolean) => (pct ? `${v}%` : fmt(v));

  return (
    <><div className="hidden sm:block overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
            <th className="py-2 pr-3 sticky left-0 bg-white">{firstCol}</th>
            {cols.map((c) => (
              <th key={c.key} className="py-2 px-3 text-right">
                <button onClick={() => onSort(c.key)}
                  className="inline-flex items-center gap-0.5 hover:text-slate-700 uppercase"
                  style={sortKey === c.key ? { color: BRAND, fontWeight: 700 } : undefined}>
                  {c.label}
                  {sortKey === c.key && (asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.key} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
              <td className="py-2 pr-3 sticky left-0 bg-white">
                <div className="text-slate-700 font-medium truncate max-w-[180px]">{r.label}</div>
                <div className="h-1.5 mt-1 rounded-full bg-slate-100 overflow-hidden" style={{ maxWidth: 150 }}>
                  <div className="h-full rounded-full" style={{ width: `${(r.leads / maxLeads) * 100}%`, background: BRAND }} />
                </div>
              </td>
              {cols.map((c) => {
                const v = r[c.key];
                const dim = v === 0;
                return (
                  <td key={c.key} className="py-2 px-3 text-right"
                    style={{
                      fontWeight: c.key === 'leads' || c.key === 'won' || c.key === 'winRate' ? 600 : 400,
                      color: dim ? '#cbd5e1' : (c.tone ?? '#334155'),
                    }}>
                    {cell(v, c.pct)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 text-slate-800 font-semibold">
            <td className="py-2 pr-3 sticky left-0 bg-white">Tổng</td>
            {cols.map((c) => (
              <td key={c.key} className="py-2 px-3 text-right" style={{ color: c.tone ?? '#0f172a' }}>{totalVal(c.key)}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>

    {/* Card view mobile */}
    <div className="sm:hidden space-y-2">
      {sorted.map((r) => (
        <div key={r.key} className="rounded-lg border border-slate-100 bg-white p-3">
          <div className="text-slate-800 font-semibold truncate">{r.label}</div>
          <div className="h-1.5 mt-1.5 mb-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.leads / maxLeads) * 100}%`, background: BRAND }} />
          </div>
          <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-[13px]">
            {cols.map((c) => {
              const v = r[c.key];
              const dim = v === 0;
              return (
                <div key={c.key} className="flex items-center justify-between">
                  <span className="text-slate-400">{c.label}</span>
                  <span className="font-semibold" style={{ color: dim ? '#cbd5e1' : (c.tone ?? '#334155') }}>{cell(v, c.pct)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="rounded-lg border-2 border-slate-200 p-3">
        <div className="text-slate-800 font-semibold mb-2">Tổng</div>
        <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-[13px]">
          {cols.map((c) => (
            <div key={c.key} className="flex items-center justify-between">
              <span className="text-slate-400">{c.label}</span>
              <span className="font-semibold" style={{ color: c.tone ?? '#0f172a' }}>{totalVal(c.key)}</span>
            </div>
          ))}
        </div>
      </div>
    </div></>
  );
}

// ─── Bảng chéo (pivot) ───────────────────────────────────────────────────────

function PivotTable({ pivot, rowLabel }: { pivot: Pivot; rowLabel: string }) {
  const maxLeads = Math.max(1, ...pivot.rows.flatMap((r) => pivot.cols.map((c) => r.cells[c.key]?.leads ?? 0)));
  const wonTag = (won: number) => won > 0 && <span className="text-[11px] font-normal" style={{ color: '#047857' }}> ·{won}</span>;
  const Cell = ({ leads, won }: { leads: number; won: number }) => {
    if (leads === 0) return <span className="text-slate-300">–</span>;
    const intensity = 0.08 + (leads / maxLeads) * 0.32;
    return (
      <span className="inline-flex items-baseline gap-1 rounded px-1.5 py-0.5" style={{ background: `rgba(0,75,155,${intensity})` }}>
        <b className="text-slate-800">{fmt(leads)}</b>
        {won > 0 && <span className="text-[11px]" style={{ color: '#047857' }}>·{won}</span>}
      </span>
    );
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
            <th className="py-2 pr-3 text-left sticky left-0 bg-white">{rowLabel}</th>
            {pivot.cols.map((c) => <th key={c.key} className="py-2 px-3 text-center">{c.label}</th>)}
            <th className="py-2 pl-3 text-right" style={{ color: BRAND }}>Tổng</th>
          </tr>
        </thead>
        <tbody>
          {pivot.rows.map((r) => (
            <tr key={r.key} className="border-b border-slate-50 last:border-0">
              <td className="py-2 pr-3 text-slate-700 font-medium truncate max-w-[180px] sticky left-0 bg-white">{r.label}</td>
              {pivot.cols.map((c) => (
                <td key={c.key} className="py-2 px-3 text-center"><Cell {...(r.cells[c.key] ?? { leads: 0, won: 0 })} /></td>
              ))}
              <td className="py-2 pl-3 text-right font-semibold text-slate-800">{fmt(r.total.leads)}{wonTag(r.total.won)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 font-semibold text-slate-800">
            <td className="py-2 pr-3 sticky left-0 bg-white">Tổng</td>
            {pivot.cols.map((c) => {
              const t = pivot.colTotals[c.key] ?? { leads: 0, won: 0 };
              return <td key={c.key} className="py-2 px-3 text-center">{fmt(t.leads)}{wonTag(t.won)}</td>;
            })}
            <td className="py-2 pl-3 text-right" style={{ color: BRAND }}>{fmt(pivot.grandTotal.leads)}{wonTag(pivot.grandTotal.won)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Build workbook ──────────────────────────────────────────────────────────

function flatSheet(leads: ReportLead[], nowMs: number, dim: Dimension, metrics: MetricCol[], catalog: SourceCatalog): SheetData {
  const rows = groupByDimension(leads, dim, nowMs, catalog);
  const totals = computeKpis(leads, nowMs);
  const header = [DIMENSION_LABEL[dim], ...metrics.map((m) => m.label)];
  const body = rows.map((r) => [r.label, ...metrics.map((m) => r[m.key] as number)]);
  const totalRow: (string | number)[] = ['Tổng', ...metrics.map((m) => totalsVal(totals, m.key))];
  return { name: DIMENSION_LABEL[dim], rows: [header, ...body, totalRow] };
}

// Tổng theo metric key (dùng chung cho xuất Excel).
function totalsVal(totals: ReturnType<typeof computeKpis>, k: MetricKey): number | string {
  switch (k) {
    case 'leads': return totals.total;
    case 'share': return 100;
    case 'contacted': return totals.contacted;
    case 'contactRate': return totals.contactRate;
    case 'interested': return totals.interested;
    case 'following': return totals.following;
    case 'won': return totals.won;
    case 'winRate': return totals.winRate;
    case 'fail': return totals.fail;
    case 'failRate': return totals.failRate;
    case 'overdue': return totals.overdue;
    case 'b10On': return totals.b10On;
    case 'b10Rate': return totals.b10Rate;
    case 'b10Interested': return totals.b10Interested;
    case 'b10Following': return totals.b10Following;
    case 'b10Won': return totals.b10Won;
    case 'b10Loai': return totals.b10Loai;
  }
}

function pivotSheet(leads: ReportLead[], rowDim: Dimension, colDim: Dimension, catalog: SourceCatalog): SheetData {
  const p = crossDimension(leads, rowDim, colDim, catalog);
  const header = [DIMENSION_LABEL[rowDim], ...p.cols.map((c) => c.label), 'Tổng'];
  const body = p.rows.map((r) => [r.label, ...p.cols.map((c) => r.cells[c.key]?.leads ?? 0), r.total.leads]);
  const totalRow: (string | number)[] = ['Tổng', ...p.cols.map((c) => p.colTotals[c.key]?.leads ?? 0), p.grandTotal.leads];
  return { name: `${DIMENSION_LABEL[rowDim]} x ${DIMENSION_LABEL[colDim]}`, rows: [header, ...body, totalRow] };
}

function buildSheets(leads: ReportLead[], nowMs: number, rowDim: Dimension, colDim: string, showB10: boolean, dims: Dimension[], catalog: SourceCatalog): SheetData[] {
  const sheets: SheetData[] = [];
  const metrics = showB10 ? [...METRICS, ...B10_METRICS] : METRICS;
  // Sheet đầu = bảng đang xem.
  if (colDim) sheets.push(pivotSheet(leads, rowDim, colDim as Dimension, catalog));
  // Mỗi chiều hợp lệ với cấp báo cáo 1 sheet chỉ số đầy đủ.
  for (const d of dims) sheets.push(flatSheet(leads, nowMs, d, metrics, catalog));
  return sheets;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </div>
  );
}
