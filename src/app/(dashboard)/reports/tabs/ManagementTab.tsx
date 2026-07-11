'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, ChevronRight, ChevronDown, SlidersHorizontal, GripVertical } from 'lucide-react';
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
import {
  MGMT_COLUMNS, MGMT_COL_MAP, MGMT_DEFAULT_ORDER, MGMT_DEFAULT_HIDDEN,
  MGMT_HIDDEN_KEY, MGMT_ORDER_KEY,
  type MgmtColKey, type MgmtColumn,
} from '../mgmt-columns';
import { Panel, BRAND, fmt, DeltaArrow } from '../ui';
import { exportXlsx } from '@/lib/xlsx-export';
import { tableSheet, type SheetCol } from '../report-export';

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

/** Một ô số cho 1 cột theo cấu hình. */
function MetricCell({ col, r }: { col: MgmtColumn; r: GroupRow }) {
  const v = col.get(r);
  const zero = v === 0 && !col.keepColor;
  return (
    <td
      className={`py-2 px-3 text-right${col.bold ? ' font-semibold' : ''}`}
      style={{ color: zero ? '#cbd5e1' : col.color }}
    >
      {col.pct ? `${v.toFixed(1)}%` : fmt(v)}
    </td>
  );
}

/** Các ô số (theo cột đang bật) + ô Δ, dùng chung cho mọi cấp dòng. */
function MetricCells({ r, cols, delta }: { r: GroupRow; cols: MgmtColumn[]; delta: number }) {
  return (
    <>
      {cols.map((c) => <MetricCell key={c.key} col={c} r={r} />)}
      <td className="py-2 px-3 text-right"><DeltaArrow delta={delta} pct /></td>
    </>
  );
}

/** Một dòng có thể mở rộng ra cấp con (đệ quy). */
function DrillRow({ row, dim, leads, prevLeads, now, depth, cols }: {
  row: GroupRow;
  dim: Dimension;
  leads: ReportLead[];
  prevLeads: ReportLead[];
  now: number;
  depth: number;
  cols: MgmtColumn[];
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
        <MetricCells r={row} cols={cols} delta={delta} />
      </tr>
      {open && childDim && (
        <DrillGroup dim={childDim} leads={subLeads} prevLeads={subPrev} now={now} depth={depth + 1} cols={cols} />
      )}
    </>
  );
}

/** Nhóm các dòng của một chiều (top-level hoặc cấp con khi mở rộng). */
function DrillGroup({ dim, leads, prevLeads, now, depth, cols }: {
  dim: Dimension;
  leads: ReportLead[];
  prevLeads: ReportLead[];
  now: number;
  depth: number;
  cols: MgmtColumn[];
}) {
  const rows = useMemo(() => groupByDimension(leads, dim, now), [leads, dim, now]);
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={cols.length + 2} className="py-2 text-slate-300 text-xs" style={{ paddingLeft: 4 + depth * 20 + 21 }}>
          Không có dữ liệu cấp dưới.
        </td>
      </tr>
    );
  }
  return (
    <>
      {rows.map((r) => (
        <DrillRow key={r.key} row={r} dim={dim} leads={leads} prevLeads={prevLeads} now={now} depth={depth} cols={cols} />
      ))}
    </>
  );
}

/** Popup tùy chỉnh cột: checkbox ẩn/hiện + kéo-thả đổi thứ tự (giống trang Lead). */
function ColumnMenu({ order, hidden, showB10, toggleCol, moveCol }: {
  order: MgmtColKey[];
  hidden: Set<MgmtColKey>;
  showB10: boolean;
  toggleCol: (k: MgmtColKey) => void;
  moveCol: (from: MgmtColKey, to: MgmtColKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [dragKey, setDragKey] = useState<MgmtColKey | null>(null);
  const [overKey, setOverKey] = useState<MgmtColKey | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, r.right - 240), top: r.bottom + 4 });
    setOpen(true);
  };
  const allowB10 = (k: MgmtColKey) => showB10 || !MGMT_COL_MAP[k].b10;

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
      >
        <SlidersHorizontal size={14} /> Cột hiển thị
      </button>
      {open && pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'fixed', top: pos.top, left: pos.left, width: 240, zIndex: 9999,
              maxHeight: '70vh', overflowY: 'auto',
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8,
            }}
          >
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-2 py-1.5">Tùy chỉnh cột</div>
            <div className="text-[10px] text-slate-400 px-2 pb-1">Tick để hiện · kéo để đổi thứ tự</div>
            {order.filter(allowB10).map((k) => {
              const c = MGMT_COL_MAP[k];
              const isOver = overKey === k && dragKey !== k;
              return (
                <label
                  key={k}
                  draggable
                  onDragStart={() => setDragKey(k)}
                  onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                  onDragOver={(e) => { e.preventDefault(); if (overKey !== k) setOverKey(k); }}
                  onDrop={(e) => { e.preventDefault(); if (dragKey) moveCol(dragKey, k); setDragKey(null); setOverKey(null); }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-700 transition-colors"
                  style={{
                    background: isOver ? '#e6f0fa' : undefined,
                    opacity: dragKey === k ? 0.4 : 1,
                    borderTop: isOver ? '2px solid #004B9B' : '2px solid transparent',
                  }}
                >
                  <GripVertical size={14} className="text-slate-300 shrink-0 cursor-grab active:cursor-grabbing" />
                  <input
                    type="checkbox"
                    checked={!hidden.has(k)}
                    onChange={() => toggleCol(k)}
                    className="accent-[#004B9B]"
                  />
                  <span className="flex-1">{c.label}</span>
                </label>
              );
            })}
          </div>
        </>,
        document.body,
      )}
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
  cols: MgmtColumn[];
  colMenu?: React.ReactNode; // nút Cột hiển thị — chỉ truyền cho bảng đầu tiên (dùng chung cấu hình)
}

function FixedTable({ title, dim, leads, prevLeads, now, periodLabel, cols, colMenu }: FixedTableProps) {
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
    // Xuất đúng cột đang hiển thị trên UI (WYSIWYG).
    const expCols: SheetCol<RankedRow>[] = [
      { header: dimLabel, value: (r) => r.label },
      ...cols.map((c): SheetCol<RankedRow> => ({ header: c.label, value: (r) => c.get(r) })),
      { header: 'Δ so kỳ trước', value: (r) => r.winRateDelta },
    ];
    const totalRow: (string | number)[] = ['Tổng', ...cols.map((c) => c.total(totals)), ''];
    const slug = `bao-cao-${dim}-${slugify(periodLabel)}`;
    exportXlsx(slug, [tableSheet(title, expCols, rowsWithDelta, totalRow)]);
  };

  return (
    <Panel
      title={title}
      desc={expandable ? 'Bấm ▸ để xem chi tiết cấp dưới' : undefined}
      action={
        <div className="flex items-center gap-2">
          {colMenu}
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-1.5 text-white shadow-sm"
            style={{ background: BRAND }}
          >
            <Download size={15} /> Xuất Excel
          </button>
        </div>
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
                {cols.map((c) => (
                  <th key={c.key} className="py-2 px-3 text-right" style={{ color: c.color }}>{c.label}</th>
                ))}
                <th className="py-2 px-3 text-right">Δ so kỳ trước</th>
              </tr>
            </thead>
            <tbody>
              <DrillGroup dim={dim} leads={leads} prevLeads={prevLeads} now={now} depth={0} cols={cols} />
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 text-slate-800 font-semibold">
                <td className="py-2 pr-3 sticky left-0 bg-white">Tổng</td>
                {cols.map((c) => {
                  const v = c.total(totals);
                  return (
                    <td key={c.key} className="py-2 px-3 text-right" style={{ color: c.color }}>
                      {c.pct ? `${v.toFixed(1)}%` : fmt(v)}
                    </td>
                  );
                })}
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
  showB10,
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

  // Cấu hình cột dùng CHUNG cho mọi bảng quản trị (cùng cấu trúc chỉ số), lưu localStorage.
  const [hidden, setHidden] = useState<Set<MgmtColKey>>(() => new Set(MGMT_DEFAULT_HIDDEN));
  const [order, setOrder] = useState<MgmtColKey[]>(MGMT_DEFAULT_ORDER);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MGMT_HIDDEN_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw) as MgmtColKey[]));
    } catch { /* ignore */ }
    try {
      const rawOrder = localStorage.getItem(MGMT_ORDER_KEY);
      if (rawOrder) {
        const saved = (JSON.parse(rawOrder) as MgmtColKey[]).filter((k) => MGMT_DEFAULT_ORDER.includes(k));
        const missing = MGMT_DEFAULT_ORDER.filter((k) => !saved.includes(k));
        setOrder([...saved, ...missing]);
      }
    } catch { /* ignore */ }
  }, []);

  const toggleCol = (key: MgmtColKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(MGMT_HIDDEN_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const moveCol = (from: MgmtColKey, to: MgmtColKey) => {
    if (from === to) return;
    setOrder((prev) => {
      const arr = [...prev];
      const fi = arr.indexOf(from);
      const ti = arr.indexOf(to);
      if (fi < 0 || ti < 0) return prev;
      arr.splice(fi, 1);
      arr.splice(ti, 0, from);
      try { localStorage.setItem(MGMT_ORDER_KEY, JSON.stringify(arr)); } catch { /* ignore */ }
      return arr;
    });
  };

  // Cột đang hiển thị: theo thứ tự user, bỏ cột ẩn, ẩn cột B10 nếu công ty chưa bật.
  const visibleCols: MgmtColumn[] = order
    .map((k) => MGMT_COL_MAP[k])
    .filter((c) => !hidden.has(c.key) && (showB10 || !c.b10));

  if (tables.length === 0) {
    return (
      <Panel title="Bảng quản trị">
        <p className="py-8 text-center text-sm text-slate-400">
          Cấp cá nhân không có bảng quản trị.
        </p>
      </Panel>
    );
  }

  // 1 nút "Cột hiển thị" dùng CHUNG cho mọi bảng — chỉ gắn ở bảng đầu tiên.
  const colMenu = (
    <ColumnMenu order={order} hidden={hidden} showB10={showB10} toggleCol={toggleCol} moveCol={moveCol} />
  );

  return (
    <div className="space-y-5">
      {tables.map(({ title, dim }, i) => (
        <FixedTable
          key={dim}
          title={title}
          dim={dim}
          leads={leads}
          prevLeads={prevLeads}
          now={now}
          periodLabel={periodLabel}
          cols={visibleCols}
          colMenu={i === 0 ? colMenu : undefined}
        />
      ))}
    </div>
  );
}
