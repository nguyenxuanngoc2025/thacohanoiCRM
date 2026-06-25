'use client';

import React, { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Download, Check } from 'lucide-react';
import {
  computeKpis, groupByDimension, crossDimension,
  DIMENSION_LABEL, type Dimension, type GroupRow, type ReportLead, type Pivot,
} from '@/lib/reports';
import { exportXlsx, type SheetData } from '@/lib/xlsx-export';
import { Panel, Dropdown, BRAND, fmt, type Opt } from './ui';

type MetricKey = 'leads' | 'share' | 'contacted' | 'contactRate' | 'following' | 'won' | 'winRate' | 'fail' | 'failRate' | 'overdue';

interface MetricCol { key: MetricKey; label: string; pct?: boolean; tone?: string }

const METRICS: MetricCol[] = [
  { key: 'leads', label: 'Lead' },
  { key: 'share', label: 'Tỉ trọng', pct: true },
  { key: 'contacted', label: 'Đã LH' },
  { key: 'contactRate', label: 'Tỉ lệ LH', pct: true },
  { key: 'following', label: 'Theo dõi' },
  { key: 'won', label: 'Ký HĐ', tone: '#047857' },
  { key: 'winRate', label: 'Tỉ lệ chốt', pct: true, tone: '#047857' },
  { key: 'fail', label: 'Loại', tone: '#be123c' },
  { key: 'failRate', label: 'Tỉ lệ loại', pct: true, tone: '#be123c' },
  { key: 'overdue', label: 'Quá hạn', tone: '#be123c' },
];

const DIM_OPTS: Opt[] = (Object.keys(DIMENSION_LABEL) as Dimension[]).map((d) => ({ value: d, label: DIMENSION_LABEL[d] }));
const ALL_DIMS = Object.keys(DIMENSION_LABEL) as Dimension[];

export default function TablesTab({ leads }: { leads: ReportLead[] }) {
  const nowMs = useMemo(() => Date.now(), []);
  const [rowDim, setRowDim] = useState<Dimension>('showroom');
  const [colDim, setColDim] = useState<string>(''); // '' = không tách cột (bảng phẳng)
  const [hidden, setHidden] = useState<Set<MetricKey>>(new Set());
  const [sortKey, setSortKey] = useState<MetricKey>('leads');
  const [asc, setAsc] = useState(false);

  const totals = useMemo(() => computeKpis(leads, nowMs), [leads, nowMs]);
  const flatRows = useMemo(() => groupByDimension(leads, rowDim, nowMs), [leads, rowDim, nowMs]);
  const pivot = useMemo<Pivot | null>(
    () => (colDim ? crossDimension(leads, rowDim, colDim as Dimension) : null),
    [leads, rowDim, colDim],
  );

  const visible = METRICS.filter((m) => !hidden.has(m.key));
  const toggle = (k: MetricKey) => setHidden((s) => {
    const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n;
  });

  // Cột tách: mọi chiều khác chiều hàng.
  const colOpts = DIM_OPTS.filter((o) => o.value !== rowDim);
  const onRowDim = (d: string) => { setRowDim(d as Dimension); if (d === colDim) setColDim(''); };

  const handleExport = () => exportXlsx('bao-cao-lead', buildSheets(leads, nowMs, rowDim, colDim));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Field label="Nhóm theo">
            <Dropdown value={rowDim} onChange={onRowDim} placeholder="Chọn" options={DIM_OPTS} allowClear={false} />
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
            {METRICS.map((m) => {
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
          ? `${DIMENSION_LABEL[rowDim]} × ${DIMENSION_LABEL[colDim as Dimension]}`
          : `Bảng chỉ số theo ${DIMENSION_LABEL[rowDim].toLowerCase()}`}
        desc={colDim ? 'Mỗi ô: số lead · số ký HĐ' : 'Bấm tiêu đề cột để sắp xếp · bật/tắt cột ở trên'}
      >
        {leads.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">Không có lead trong kỳ / bộ lọc.</div>
        ) : pivot ? (
          <PivotTable pivot={pivot} rowLabel={DIMENSION_LABEL[rowDim]} />
        ) : (
          <FlatTable
            rows={flatRows} cols={visible} firstCol={DIMENSION_LABEL[rowDim]} totals={totals}
            sortKey={sortKey} asc={asc}
            onSort={(k) => { if (k === sortKey) setAsc((v) => !v); else { setSortKey(k); setAsc(false); } }}
          />
        )}
      </Panel>

      <p className="text-xs text-slate-400">
        Nút <b>Xuất Excel</b> tạo file .xlsx gồm bảng đang xem + 1 sheet cho mỗi chiều (Showroom, Thương hiệu, Nguồn, TVBH, Trạng thái).
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
      case 'following': return totals.following;
      case 'won': return totals.won;
      case 'winRate': return `${totals.winRate}%`;
      case 'fail': return totals.fail;
      case 'failRate': return `${totals.failRate}%`;
      case 'overdue': return totals.overdue;
    }
  };
  const cell = (v: number, pct?: boolean) => (pct ? `${v}%` : fmt(v));

  return (
    <div className="overflow-x-auto">
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

function flatSheet(leads: ReportLead[], nowMs: number, dim: Dimension): SheetData {
  const rows = groupByDimension(leads, dim, nowMs);
  const totals = computeKpis(leads, nowMs);
  const header = [DIMENSION_LABEL[dim], ...METRICS.map((m) => m.label)];
  const body = rows.map((r) => [r.label, ...METRICS.map((m) => r[m.key])]);
  const totalRow: (string | number)[] = ['Tổng', totals.total, 100, totals.contacted, totals.contactRate, totals.following, totals.won, totals.winRate, totals.fail, totals.failRate, totals.overdue];
  return { name: DIMENSION_LABEL[dim], rows: [header, ...body, totalRow] };
}

function pivotSheet(leads: ReportLead[], rowDim: Dimension, colDim: Dimension): SheetData {
  const p = crossDimension(leads, rowDim, colDim);
  const header = [DIMENSION_LABEL[rowDim], ...p.cols.map((c) => c.label), 'Tổng'];
  const body = p.rows.map((r) => [r.label, ...p.cols.map((c) => r.cells[c.key]?.leads ?? 0), r.total.leads]);
  const totalRow: (string | number)[] = ['Tổng', ...p.cols.map((c) => p.colTotals[c.key]?.leads ?? 0), p.grandTotal.leads];
  return { name: `${DIMENSION_LABEL[rowDim]} x ${DIMENSION_LABEL[colDim]}`, rows: [header, ...body, totalRow] };
}

function buildSheets(leads: ReportLead[], nowMs: number, rowDim: Dimension, colDim: string): SheetData[] {
  const sheets: SheetData[] = [];
  // Sheet đầu = bảng đang xem.
  if (colDim) sheets.push(pivotSheet(leads, rowDim, colDim as Dimension));
  // Mỗi chiều 1 sheet chỉ số đầy đủ.
  for (const d of ALL_DIMS) sheets.push(flatSheet(leads, nowMs, d));
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
