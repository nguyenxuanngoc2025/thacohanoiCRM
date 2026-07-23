'use client';
import React, { useMemo, useState } from 'react';
import { Download, ChevronRight, ChevronDown } from 'lucide-react';
import {
  pct, rollupTotals, budgetValue, groupKpiRows,
  type KpiRow, type KpiDim, type KpiGroup, type KpiTotals,
} from '@/lib/kpi-targets';
import type { ModelCatalogItem } from '@/lib/mkt-planning-report';
import { Panel, BRAND, fmt } from '../ui';
import { exportXlsx } from '@/lib/xlsx-export';
import { tableSheet, type SheetCol } from '../report-export';

const money = (n: number) => fmt(Math.round(n));

// Nhãn cột đầu theo chiều gốc của mỗi bảng.
const DIM_LABEL: Record<KpiDim, string> = {
  showroom: 'Showroom', brand: 'Thương hiệu', model: 'Dòng xe', channel: 'Kênh Marketing',
};

// Cấu trúc 3 bảng: chuỗi drill (chiều gốc → các cấp con). Dòng xe luôn sắp theo Báo cáo cho Marketing.
const TABLES: { title: string; chain: KpiDim[] }[] = [
  { title: 'Theo Showroom', chain: ['showroom', 'model', 'channel'] },
  { title: 'Theo Thương hiệu', chain: ['brand', 'model', 'channel'] },
  { title: 'Theo Kênh Marketing', chain: ['channel', 'brand', 'model'] },
];

// 3 chỉ số phễu, mỗi chỉ số 3 cột KH / TH / %TH.
const METRICS: { label: string; plan: keyof KpiTotals; actual: keyof KpiTotals }[] = [
  { label: 'KHQT', plan: 'plan_khqt', actual: 'actual_khqt' },
  { label: 'GDTD', plan: 'plan_gdtd', actual: 'actual_gdtd' },
  { label: 'KHĐ', plan: 'plan_khd', actual: 'actual_khd' },
];

const TOTAL_COLS = 1 /*dim*/ + 1 /*budget*/ + METRICS.length * 3;

// Đường phân khu giữa các nhóm cột.
const SEP = 'border-l border-slate-300';

/** Nhóm 3 ô KH / TH / %TH cho từng chỉ số (ô KH mở đầu nhóm có vạch ngăn). */
function MetricCells({ t }: { t: KpiTotals }) {
  return (
    <>
      {METRICS.map((m) => {
        const plan = t[m.plan] as number;
        const actual = t[m.actual] as number;
        return (
          <React.Fragment key={m.label}>
            <td className={`py-2 px-3 text-right text-slate-400 ${SEP}`}>{plan ? fmt(plan) : '—'}</td>
            <td className="py-2 px-3 text-right text-slate-800">{fmt(actual)}</td>
            <td className="py-2 px-3 text-right font-semibold text-slate-700">{plan ? `${pct(actual, plan)}%` : '—'}</td>
          </React.Fragment>
        );
      })}
    </>
  );
}

/** Một dòng có thể mở rộng ra cấp con (đệ quy theo chuỗi drill). */
function DrillRow({ group, chain, depth, modelOrder }: {
  group: KpiGroup; chain: KpiDim[]; depth: number; modelOrder: Map<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const childChain = chain.slice(1);
  const canExpand = childChain.length > 0;
  const t = group.totals;
  return (
    <>
      <tr className="border-b border-slate-50 hover:bg-slate-50/60">
        <td className="py-2 pr-3 sticky left-0 bg-inherit" style={{ paddingLeft: 8 + depth * 20 }}>
          <div className="flex items-center gap-1.5">
            {canExpand ? (
              <button onClick={() => setOpen((o) => !o)} className="shrink-0 text-slate-400 hover:text-slate-700"
                aria-label={open ? 'Thu gọn' : 'Mở rộng'}>
                {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
            ) : (
              <span className="shrink-0 inline-block" style={{ width: 15 }} />
            )}
            <span className={`truncate block ${depth === 0 ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>
              {group.label}
            </span>
          </div>
        </td>
        <td className={`py-2 px-3 text-right text-slate-600 ${SEP}`}>{money(budgetValue(t))}</td>
        <MetricCells t={t} />
      </tr>
      {open && canExpand && (
        <DrillGroup rows={group.rows} chain={childChain} depth={depth + 1} modelOrder={modelOrder} />
      )}
    </>
  );
}

/** Gom + render các dòng của cấp hiện tại (chain[0]). */
function DrillGroup({ rows, chain, depth, modelOrder }: {
  rows: KpiRow[]; chain: KpiDim[]; depth: number; modelOrder: Map<string, number>;
}) {
  const groups = useMemo(() => groupKpiRows(rows, chain[0], modelOrder), [rows, chain, modelOrder]);
  if (groups.length === 0) {
    return (
      <tr>
        <td colSpan={TOTAL_COLS} className="py-2 text-slate-300 text-xs" style={{ paddingLeft: 8 + depth * 20 + 21 }}>
          Không có dữ liệu cấp dưới.
        </td>
      </tr>
    );
  }
  return (
    <>
      {groups.map((g) => (
        <DrillRow key={g.key} group={g} chain={chain} depth={depth} modelOrder={modelOrder} />
      ))}
    </>
  );
}

function KpiTable({ title, chain, rows, modelOrder, periodSlug }: {
  title: string; chain: KpiDim[]; rows: KpiRow[]; modelOrder: Map<string, number>; periodSlug: string;
}) {
  const dim = chain[0];
  const topGroups = useMemo(() => groupKpiRows(rows, dim, modelOrder), [rows, dim, modelOrder]);
  const totals = useMemo(() => rollupTotals(rows), [rows]);

  const handleExport = () => {
    const cols: SheetCol<KpiGroup>[] = [
      { header: DIM_LABEL[dim], value: (g) => g.label },
      { header: 'Ngân sách', value: (g) => Math.round(budgetValue(g.totals)) },
    ];
    for (const m of METRICS) {
      cols.push({ header: `${m.label} KH`, value: (g) => g.totals[m.plan] as number });
      cols.push({ header: `${m.label} TH`, value: (g) => g.totals[m.actual] as number });
      cols.push({ header: `${m.label} %TH`, value: (g) => pct(g.totals[m.actual] as number, g.totals[m.plan] as number) });
    }
    const totalRow: (string | number)[] = ['Tổng', Math.round(budgetValue(totals))];
    for (const m of METRICS) {
      totalRow.push(totals[m.plan] as number, totals[m.actual] as number, pct(totals[m.actual] as number, totals[m.plan] as number));
    }
    exportXlsx(`kpi-${dim}-${periodSlug}`, [tableSheet(title, cols, topGroups, totalRow)]);
  };

  return (
    <Panel
      title={title}
      desc="Bấm ▸ để xem chi tiết cấp dưới"
      action={
        <button onClick={handleExport}
          className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-1.5 text-white shadow-sm"
          style={{ background: BRAND }}>
          <Download size={15} /> Xuất Excel
        </button>
      }
    >
      {topGroups.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">Không có dữ liệu trong kỳ / bộ lọc.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed min-w-[860px]">
            <colgroup>
              <col style={{ width: 220 }} />
              <col style={{ width: 104 }} />
              {METRICS.map((m) => (
                <React.Fragment key={m.label}>
                  <col /><col /><col />
                </React.Fragment>
              ))}
            </colgroup>
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50 border-y border-slate-200">
                <th className="py-2.5 px-3 text-left sticky left-0 bg-slate-50" rowSpan={2}>{DIM_LABEL[dim]}</th>
                <th className={`py-2.5 px-3 text-right align-bottom ${SEP}`} rowSpan={2}>Ngân sách</th>
                {METRICS.map((m) => (
                  <th key={m.label} className={`py-2 px-3 text-center font-bold text-slate-700 ${SEP}`} colSpan={3}>{m.label}</th>
                ))}
              </tr>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400 bg-slate-50 border-b border-slate-200">
                {METRICS.map((m) => (
                  <React.Fragment key={m.label}>
                    <th className={`py-1.5 px-3 text-right font-medium ${SEP}`}>KH</th>
                    <th className="py-1.5 px-3 text-right font-medium">TH</th>
                    <th className="py-1.5 px-3 text-right font-medium">%TH</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              <DrillGroup rows={rows} chain={chain} depth={0} modelOrder={modelOrder} />
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 text-slate-800 font-semibold bg-slate-50/50">
                <td className="py-2 px-3 sticky left-0 bg-slate-50">Tổng</td>
                <td className={`py-2 px-3 text-right ${SEP}`}>{money(budgetValue(totals))}</td>
                <MetricCells t={totals} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
}

export default function KpiTargetsTab({ rows, year, month, models = [] }: {
  rows: KpiRow[]; year: number; month: number; models?: ModelCatalogItem[];
}) {
  // Thứ tự dòng xe: tuân thủ trang Báo cáo cho Marketing (sort_order rồi tên).
  const modelOrder = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of models) if (!m.has(it.name)) m.set(it.name, it.sort_order);
    return m;
  }, [models]);
  const periodSlug = `${year}-${String(month).padStart(2, '0')}`;

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">
        Chưa có dữ liệu mục tiêu cho tháng {month}/{year}. Kiểm tra ánh xạ dòng xe hoặc chọn tháng khác.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-sm text-slate-500">
        Kỳ mục tiêu: tháng {month}/{year} · Ngân sách lấy từ App Budget (ưu tiên thực chi, chưa có thì lấy kế hoạch) · KH = kế hoạch, TH = thực hiện.
      </div>
      {TABLES.map((tbl) => (
        <KpiTable key={tbl.title} title={tbl.title} chain={tbl.chain} rows={rows} modelOrder={modelOrder} periodSlug={periodSlug} />
      ))}
    </div>
  );
}
