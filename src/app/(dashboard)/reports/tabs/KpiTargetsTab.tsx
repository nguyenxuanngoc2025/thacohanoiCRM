'use client';
import React, { useMemo, useState } from 'react';
import { Download, ChevronRight, ChevronDown } from 'lucide-react';
import {
  pct, rollupTotals, budgetValue, groupKpiRows, buildShowroomOrder, buildModelOrder,
  cpbqPerKhqt, convKhqtGdtd, convGdtdKhd,
  type KpiRow, type KpiDim, type KpiGroup, type KpiTotals,
} from '@/lib/kpi-targets';
import { Panel, BRAND, fmt } from '../ui';
import { exportXlsx } from '@/lib/xlsx-export';
import { tableSheet, type SheetCol } from '../report-export';

// Ngân sách hiển thị theo triệu, giữ 1 số thập phân (vd 9,5).
const money = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });

// Nhãn cột đầu theo chiều gốc của mỗi bảng.
const DIM_LABEL: Record<KpiDim, string> = {
  showroom: 'Showroom', brand: 'Thương hiệu', model: 'Dòng xe', channel: 'Kênh Marketing',
};

// Cấu trúc 3 bảng: chuỗi drill (chiều gốc → các cấp con). Dòng xe luôn sắp theo Báo cáo cho Marketing.
const TABLES: { title: string; chain: KpiDim[] }[] = [
  { title: 'Theo Showroom', chain: ['showroom', 'brand', 'model', 'channel'] },
  { title: 'Theo Thương hiệu', chain: ['brand', 'model', 'channel'] },
  { title: 'Theo Kênh Marketing', chain: ['channel', 'brand', 'model'] },
];

// 3 chỉ số phễu, mỗi chỉ số 3 cột KH / TH / %TH.
const METRICS: { label: string; plan: keyof KpiTotals; actual: keyof KpiTotals }[] = [
  { label: 'KHQT', plan: 'plan_khqt', actual: 'actual_khqt' },
  { label: 'GDTD', plan: 'plan_gdtd', actual: 'actual_gdtd' },
  { label: 'KHĐ', plan: 'plan_khd', actual: 'actual_khd' },
];

// Nhóm "Đánh giá hiệu quả": 3 cột dẫn xuất từ số THỰC HIỆN.
const EFF_COLS: { label: string; title: string }[] = [
  { label: 'CPBQ/KHQT', title: 'Chi phí bình quân trên 1 KHQT (triệu)' },
  { label: 'KHQT→GDTD', title: 'Tỷ lệ chuyển đổi KHQT sang GDTD' },
  { label: 'GDTD→KHĐ', title: 'Tỷ lệ chuyển đổi GDTD sang KHĐ' },
];

const TOTAL_COLS = 1 /*dim*/ + 1 /*budget*/ + METRICS.length * 3 + EFF_COLS.length;

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

/** Nhóm 3 ô đánh giá hiệu quả (CPBQ/KHQT theo triệu, 2 tỷ lệ chuyển đổi %). */
function EffCells({ t }: { t: KpiTotals }) {
  const cpbq = cpbqPerKhqt(t);
  const c1 = convKhqtGdtd(t);
  const c2 = convGdtdKhd(t);
  return (
    <>
      <td className={`py-2 px-3 text-right text-slate-700 ${SEP}`}>{cpbq == null ? '—' : money(cpbq)}</td>
      <td className="py-2 px-3 text-right text-slate-700">{c1 == null ? '—' : `${c1}%`}</td>
      <td className="py-2 px-3 text-right text-slate-700">{c2 == null ? '—' : `${c2}%`}</td>
    </>
  );
}

/** Một dòng có thể mở rộng ra cấp con (đệ quy theo chuỗi drill). */
function DrillRow({ group, chain, depth, modelOrder, showroomOrder }: {
  group: KpiGroup; chain: KpiDim[]; depth: number; modelOrder: Map<string, number>; showroomOrder: Map<string, number>;
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
        <EffCells t={t} />
      </tr>
      {open && canExpand && (
        <DrillGroup rows={group.rows} chain={childChain} depth={depth + 1} modelOrder={modelOrder} showroomOrder={showroomOrder} />
      )}
    </>
  );
}

/** Gom + render các dòng của cấp hiện tại (chain[0]). */
function DrillGroup({ rows, chain, depth, modelOrder, showroomOrder }: {
  rows: KpiRow[]; chain: KpiDim[]; depth: number; modelOrder: Map<string, number>; showroomOrder: Map<string, number>;
}) {
  const groups = useMemo(() => groupKpiRows(rows, chain[0], modelOrder, showroomOrder), [rows, chain, modelOrder, showroomOrder]);
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
        <DrillRow key={g.key} group={g} chain={chain} depth={depth} modelOrder={modelOrder} showroomOrder={showroomOrder} />
      ))}
    </>
  );
}

function KpiTable({ title, chain, rows, modelOrder, showroomOrder, periodSlug }: {
  title: string; chain: KpiDim[]; rows: KpiRow[]; modelOrder: Map<string, number>; showroomOrder: Map<string, number>; periodSlug: string;
}) {
  const dim = chain[0];
  const topGroups = useMemo(() => groupKpiRows(rows, dim, modelOrder, showroomOrder), [rows, dim, modelOrder, showroomOrder]);
  const totals = useMemo(() => rollupTotals(rows), [rows]);

  const handleExport = () => {
    const cols: SheetCol<KpiGroup>[] = [
      { header: DIM_LABEL[dim], value: (g) => g.label },
      { header: 'Ngân sách', value: (g) => budgetValue(g.totals) },
    ];
    for (const m of METRICS) {
      cols.push({ header: `${m.label} KH`, value: (g) => g.totals[m.plan] as number });
      cols.push({ header: `${m.label} TH`, value: (g) => g.totals[m.actual] as number });
      cols.push({ header: `${m.label} %TH`, value: (g) => pct(g.totals[m.actual] as number, g.totals[m.plan] as number) });
    }
    cols.push({ header: 'CPBQ/KHQT (triệu)', value: (g) => cpbqPerKhqt(g.totals) ?? '' });
    cols.push({ header: 'KHQT→GDTD %', value: (g) => convKhqtGdtd(g.totals) ?? '' });
    cols.push({ header: 'GDTD→KHĐ %', value: (g) => convGdtdKhd(g.totals) ?? '' });
    const totalRow: (string | number)[] = ['Tổng', budgetValue(totals)];
    for (const m of METRICS) {
      totalRow.push(totals[m.plan] as number, totals[m.actual] as number, pct(totals[m.actual] as number, totals[m.plan] as number));
    }
    totalRow.push(cpbqPerKhqt(totals) ?? '', convKhqtGdtd(totals) ?? '', convGdtdKhd(totals) ?? '');
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
          <table className="w-full text-sm table-fixed min-w-[1120px]">
            <colgroup>
              <col style={{ width: 220 }} />
              <col style={{ width: 104 }} />
              {METRICS.map((m) => (
                <React.Fragment key={m.label}>
                  <col /><col /><col />
                </React.Fragment>
              ))}
              {EFF_COLS.map((c) => (
                <col key={c.label} style={{ width: 92 }} />
              ))}
            </colgroup>
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50 border-y border-slate-200">
                <th className="py-2.5 px-3 text-left sticky left-0 bg-slate-50" rowSpan={2}>{DIM_LABEL[dim]}</th>
                <th className={`py-2.5 px-3 text-right align-bottom ${SEP}`} rowSpan={2}>Ngân sách</th>
                {METRICS.map((m) => (
                  <th key={m.label} className={`py-2 px-3 text-center font-bold text-slate-700 ${SEP}`} colSpan={3}>{m.label}</th>
                ))}
                <th className={`py-2 px-3 text-center font-bold text-slate-700 ${SEP}`} colSpan={EFF_COLS.length}>Đánh giá hiệu quả</th>
              </tr>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400 bg-slate-50 border-b border-slate-200">
                {METRICS.map((m) => (
                  <React.Fragment key={m.label}>
                    <th className={`py-1.5 px-3 text-right font-medium ${SEP}`}>KH</th>
                    <th className="py-1.5 px-3 text-right font-medium">TH</th>
                    <th className="py-1.5 px-3 text-right font-medium">%TH</th>
                  </React.Fragment>
                ))}
                {EFF_COLS.map((c, i) => (
                  <th key={c.label} title={c.title} className={`py-1.5 px-3 text-right font-medium ${i === 0 ? SEP : ''}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <DrillGroup rows={rows} chain={chain} depth={0} modelOrder={modelOrder} showroomOrder={showroomOrder} />
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 text-slate-800 font-semibold bg-slate-50/50">
                <td className="py-2 px-3 sticky left-0 bg-slate-50">Tổng</td>
                <td className={`py-2 px-3 text-right ${SEP}`}>{money(budgetValue(totals))}</td>
                <MetricCells t={totals} />
                <EffCells t={totals} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
}

export default function KpiTargetsTab({ rows, year, month }: {
  rows: KpiRow[]; year: number; month: number;
}) {
  // Thứ tự showroom + dòng xe LẤY TỪ BUDGET làm chuẩn:
  // showroom theo weight (giảm dần), dòng xe theo master_models.sort_order (tăng dần).
  const modelOrder = useMemo(() => buildModelOrder(rows), [rows]);
  const showroomOrder = useMemo(() => buildShowroomOrder(rows), [rows]);
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
        Kỳ mục tiêu: tháng {month}/{year} · Ngân sách lấy từ App Budget (ưu tiên thực chi, chưa có thì lấy kế hoạch) · KH = kế hoạch, TH = thực hiện · Đánh giá hiệu quả tính trên số thực hiện: CPBQ/KHQT = ngân sách ÷ KHQT (triệu), KHQT→GDTD và GDTD→KHĐ là tỷ lệ chuyển đổi.
      </div>
      {TABLES.map((tbl) => (
        <KpiTable key={tbl.title} title={tbl.title} chain={tbl.chain} rows={rows} modelOrder={modelOrder} showroomOrder={showroomOrder} periodSlug={periodSlug} />
      ))}
    </div>
  );
}
