'use client';

import React, { useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Users, PhoneCall, TrendingUp, FileSignature, Clock, XCircle, ArrowUp, ArrowDown } from 'lucide-react';
import {
  computeKpis, computeFunnel, groupBySource, groupByShowroom, groupByBrand,
  groupByAssignee, dailyTrend, failReasons, statusDistribution, crossShowroomBrand,
  type ReportLead, type GroupRow, type Pivot,
} from '@/lib/reports';

export type RangeKey = 'this_month' | 'last_month' | '30d' | 'custom';

const BRAND = '#004B9B';
const fmt = (n: number) => n.toLocaleString('vi-VN');

interface Opt { value: string; label: string }

export default function ReportsView({
  leads, range, from, to, fromMs, toMs,
}: {
  leads: ReportLead[];
  range: RangeKey;
  from: string;
  to: string;
  fromMs: number;
  toMs: number;
}) {
  const router = useRouter();
  const nowMs = useMemo(() => Date.now(), []);

  const [brand, setBrand] = useState('');
  const [showroom, setShowroom] = useState('');
  const [source, setSource] = useState('');
  const [cFrom, setCFrom] = useState(from);
  const [cTo, setCTo] = useState(to);

  // Tùy chọn lọc suy ra từ dữ liệu trong kỳ (đúng phạm vi RLS của người xem).
  const brandOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.brand_id, l.brand_name]), [leads]);
  const showroomOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.showroom_id, l.showroom_name]), [leads]);
  const sourceOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.source, l.source]), [leads]);

  const filtered = useMemo(
    () => leads.filter((l) =>
      (!brand || l.brand_id === brand) &&
      (!showroom || l.showroom_id === showroom) &&
      (!source || l.source === source)),
    [leads, brand, showroom, source],
  );

  const kpis = useMemo(() => computeKpis(filtered, nowMs), [filtered, nowMs]);
  const funnel = useMemo(() => computeFunnel(filtered), [filtered]);
  const bySource = useMemo(() => groupBySource(filtered, nowMs), [filtered, nowMs]);
  const byShowroom = useMemo(() => groupByShowroom(filtered, nowMs), [filtered, nowMs]);
  const byBrand = useMemo(() => groupByBrand(filtered, nowMs), [filtered, nowMs]);
  const byAssignee = useMemo(() => groupByAssignee(filtered, nowMs), [filtered, nowMs]);
  const pivot = useMemo(() => crossShowroomBrand(filtered), [filtered]);
  const trend = useMemo(() => dailyTrend(filtered, fromMs, toMs), [filtered, fromMs, toMs]);
  const reasons = useMemo(() => failReasons(filtered), [filtered]);
  const statusDist = useMemo(() => statusDistribution(filtered), [filtered]);

  const setRange = (r: RangeKey) => router.push(`/reports?range=${r}`);
  const applyCustom = () => router.push(`/reports?range=custom&from=${cFrom}&to=${cTo}`);

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Báo cáo</h1>
          <p className="text-sm text-slate-400 mt-0.5">Phân tích hiệu quả lead theo kênh & tỉ lệ chốt</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {([
            ['this_month', 'Tháng này'],
            ['last_month', 'Tháng trước'],
            ['30d', '30 ngày'],
          ] as [RangeKey, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className="text-sm rounded-lg px-3 py-1.5 border transition-colors"
              style={range === k
                ? { background: '#e6f0fa', borderColor: BRAND, color: BRAND, fontWeight: 600 }
                : { background: '#fff', borderColor: '#e2e8f0', color: '#64748b' }}
            >
              {label}
            </button>
          ))}
          <div className="flex items-center gap-1.5 border rounded-lg px-2 py-1"
            style={range === 'custom' ? { borderColor: BRAND, background: '#e6f0fa' } : { borderColor: '#e2e8f0' }}>
            <input type="date" value={cFrom} max={cTo} onChange={(e) => setCFrom(e.target.value)}
              className="text-sm bg-transparent outline-none text-slate-700" />
            <span className="text-slate-300">–</span>
            <input type="date" value={cTo} min={cFrom} onChange={(e) => setCTo(e.target.value)}
              className="text-sm bg-transparent outline-none text-slate-700" />
            <button onClick={applyCustom} className="text-xs font-semibold rounded-md px-2 py-1 text-white" style={{ background: BRAND }}>
              Áp dụng
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Lọc nhanh</span>
        <Dropdown value={brand} onChange={setBrand} placeholder="Tất cả thương hiệu" options={brandOpts} />
        <Dropdown value={showroom} onChange={setShowroom} placeholder="Tất cả showroom" options={showroomOpts} />
        <Dropdown value={source} onChange={setSource} placeholder="Tất cả nguồn" options={sourceOpts} />
        {(brand || showroom || source) && (
          <button onClick={() => { setBrand(''); setShowroom(''); setSource(''); }}
            className="text-xs text-rose-600 hover:underline">Xoá lọc</button>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi icon={<Users size={16} />} label="Tổng lead" value={fmt(kpis.total)} tone="#0f172a" />
        <Kpi icon={<PhoneCall size={16} />} label="Đã liên hệ" value={fmt(kpis.contacted)} sub={`${kpis.contactRate}%`} tone="#1d4ed8" />
        <Kpi icon={<TrendingUp size={16} />} label="Đang theo dõi" value={fmt(kpis.following)} tone="#b45309" />
        <Kpi icon={<FileSignature size={16} />} label="Ký hợp đồng" value={fmt(kpis.won)} sub={`Tỉ lệ chốt ${kpis.winRate}%`} tone="#047857" />
        <Kpi icon={<Clock size={16} />} label="Quá hạn liên hệ" value={fmt(kpis.overdue)} tone="#be123c" />
        <Kpi icon={<XCircle size={16} />} label="Loại" value={fmt(kpis.fail)} sub={`${kpis.failRate}%`} tone="#64748b" />
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <div className="py-12 text-center text-slate-400 text-sm">Không có lead nào trong kỳ / bộ lọc đã chọn.</div>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Phễu */}
            <Panel title="Phễu chuyển đổi">
              <div className="space-y-2.5">
                {funnel.map((s, i) => (
                  <div key={s.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600">{s.label}</span>
                      <span className="font-semibold text-slate-800">{fmt(s.count)} <span className="text-slate-400 font-normal">· {s.pct}%</span></span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: funnelColor(i) }} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Phân bổ trạng thái */}
            <Panel title="Phân bổ theo trạng thái">
              <BarList rows={statusDist.map((s) => ({ key: s.code, label: s.label, value: s.count }))} unit="lead" />
            </Panel>
          </div>

          {/* So sánh showroom */}
          <Panel title="So sánh showroom" desc="Bấm tiêu đề cột để sắp xếp">
            <CompareTable rows={byShowroom} firstCol="Showroom" totals={kpis} />
          </Panel>

          {/* So sánh thương hiệu */}
          <Panel title="So sánh thương hiệu" desc="Bấm tiêu đề cột để sắp xếp">
            <CompareTable rows={byBrand} firstCol="Thương hiệu" totals={kpis} />
          </Panel>

          {/* Ma trận chéo Showroom × Thương hiệu */}
          {pivot.cols.length > 1 && (
            <Panel title="Ma trận Showroom × Thương hiệu" desc="Mỗi ô: số lead · số ký HĐ — showroom nào mạnh thương hiệu nào">
              <PivotTable pivot={pivot} />
            </Panel>
          )}

          {/* Hiệu quả theo nguồn */}
          <Panel title="Hiệu quả theo nguồn" desc="Kênh nào mang lại nhiều lead & tỉ lệ chốt cao nhất">
            <CompareTable rows={bySource} firstCol="Nguồn" totals={kpis} />
          </Panel>

          {/* Hiệu suất TVBH */}
          {byAssignee.length > 0 && (
            <Panel title="Hiệu suất tư vấn bán hàng"
              desc={showroom ? 'Trong showroom đang lọc — bấm tiêu đề để sắp xếp' : 'Toàn bộ TVBH — lọc theo showroom để so sánh trong từng showroom'}>
              <CompareTable rows={byAssignee} firstCol="Tư vấn bán hàng" totals={kpis} rank />
            </Panel>
          )}

          {/* Xu hướng */}
          <Panel title="Lead mới theo ngày">
            <TrendChart data={trend} />
          </Panel>

          {/* Lý do loại */}
          {reasons.length > 0 && (
            <Panel title="Lý do loại lead">
              <BarList rows={reasons.map((r) => ({ key: r.reason, label: r.reason, value: r.count }))} unit="lead" tone="#be123c" />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

// ─── Helpers UI ──────────────────────────────────────────────────────────────

function uniqOpts(leads: ReportLead[], pick: (l: ReportLead) => [string | null, string | null]): Opt[] {
  const map = new Map<string, string>();
  for (const l of leads) {
    const [v, lbl] = pick(l);
    if (v == null) continue;
    if (!map.has(v)) map.set(v, lbl ?? v);
  }
  return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

function funnelColor(i: number): string {
  return ['#0f172a', '#1d4ed8', '#0891b2', '#b45309', '#047857'][i] ?? BRAND;
}

function Panel({ title, desc, children }: { title?: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      {title && (
        <div className="mb-4">
          <h2 className="font-bold text-slate-800">{title}</h2>
          {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 text-slate-400">
        <span style={{ color: tone }}>{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold" style={{ color: tone }}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function BarList({ rows, unit, tone = BRAND }: { rows: { key: string; label: string; value: number }[]; unit: string; tone?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-600 truncate pr-2">{r.label}</span>
            <span className="font-semibold text-slate-800 shrink-0">{fmt(r.value)} <span className="text-slate-400 font-normal">{unit}</span></span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: tone }} />
          </div>
        </div>
      ))}
    </div>
  );
}

type SortKey = 'leads' | 'share' | 'contactRate' | 'following' | 'won' | 'winRate' | 'failRate' | 'overdue';

const COMPARE_COLS: { key: SortKey; label: string; pct?: boolean; tone?: string }[] = [
  { key: 'leads', label: 'Lead' },
  { key: 'share', label: 'Tỉ trọng', pct: true },
  { key: 'contactRate', label: 'Đã LH', pct: true },
  { key: 'following', label: 'Theo dõi' },
  { key: 'won', label: 'Ký HĐ', tone: '#047857' },
  { key: 'winRate', label: 'Tỉ lệ chốt', pct: true, tone: '#047857' },
  { key: 'failRate', label: 'Loại', pct: true, tone: '#be123c' },
  { key: 'overdue', label: 'Quá hạn', tone: '#be123c' },
];

function CompareTable({ rows, firstCol, totals, rank }: {
  rows: GroupRow[]; firstCol: string; totals: ReturnType<typeof computeKpis>; rank?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('leads');
  const [asc, setAsc] = useState(false);
  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => (asc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
    return arr;
  }, [rows, sortKey, asc]);
  const maxLeads = Math.max(1, ...rows.map((r) => r.leads));
  const onSort = (k: SortKey) => {
    if (k === sortKey) setAsc((v) => !v);
    else { setSortKey(k); setAsc(false); }
  };
  const cell = (v: number, pct?: boolean) => (pct ? `${v}%` : fmt(v));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
            {rank && <th className="py-2 pr-2 w-8">#</th>}
            <th className="py-2 pr-3">{firstCol}</th>
            {COMPARE_COLS.map((c) => (
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
          {sorted.map((r, i) => (
            <tr key={r.key} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
              {rank && <td className="py-2 pr-2 text-slate-400 font-medium">{i + 1}</td>}
              <td className="py-2 pr-3">
                <div className="text-slate-700 font-medium truncate max-w-[180px]">{r.label}</div>
                <div className="h-1.5 mt-1 rounded-full bg-slate-100 overflow-hidden" style={{ maxWidth: 150 }}>
                  <div className="h-full rounded-full" style={{ width: `${(r.leads / maxLeads) * 100}%`, background: BRAND }} />
                </div>
              </td>
              {COMPARE_COLS.map((c) => {
                const v = r[c.key];
                const dim = v === 0;
                const isFirst = c.key === 'leads';
                return (
                  <td key={c.key} className="py-2 px-3 text-right"
                    style={{
                      fontWeight: isFirst || c.key === 'won' || c.key === 'winRate' ? 600 : 400,
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
            {rank && <td className="py-2 pr-2" />}
            <td className="py-2 pr-3">Tổng</td>
            <td className="py-2 px-3 text-right">{fmt(totals.total)}</td>
            <td className="py-2 px-3 text-right text-slate-400">100%</td>
            <td className="py-2 px-3 text-right">{totals.contactRate}%</td>
            <td className="py-2 px-3 text-right">{fmt(totals.following)}</td>
            <td className="py-2 px-3 text-right" style={{ color: '#047857' }}>{fmt(totals.won)}</td>
            <td className="py-2 px-3 text-right" style={{ color: '#047857' }}>{totals.winRate}%</td>
            <td className="py-2 px-3 text-right" style={{ color: '#be123c' }}>{totals.failRate}%</td>
            <td className="py-2 px-3 text-right" style={{ color: '#be123c' }}>{fmt(totals.overdue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PivotTable({ pivot }: { pivot: Pivot }) {
  const maxLeads = Math.max(1, ...pivot.rows.flatMap((r) => pivot.cols.map((c) => r.cells[c.key]?.leads ?? 0)));
  const Cell = ({ leads, won }: { leads: number; won: number }) => {
    if (leads === 0) return <span className="text-slate-300">–</span>;
    const intensity = 0.08 + (leads / maxLeads) * 0.32;
    return (
      <span className="inline-flex items-baseline gap-1 rounded px-1.5 py-0.5"
        style={{ background: `rgba(0,75,155,${intensity})` }}>
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
            <th className="py-2 pr-3 text-left">Showroom</th>
            {pivot.cols.map((c) => <th key={c.key} className="py-2 px-3 text-center">{c.label}</th>)}
            <th className="py-2 pl-3 text-right" style={{ color: BRAND }}>Tổng</th>
          </tr>
        </thead>
        <tbody>
          {pivot.rows.map((r) => (
            <tr key={r.key} className="border-b border-slate-50 last:border-0">
              <td className="py-2 pr-3 text-slate-700 font-medium truncate max-w-[180px]">{r.label}</td>
              {pivot.cols.map((c) => (
                <td key={c.key} className="py-2 px-3 text-center"><Cell {...(r.cells[c.key] ?? { leads: 0, won: 0 })} /></td>
              ))}
              <td className="py-2 pl-3 text-right font-semibold text-slate-800">
                {fmt(r.total.leads)}{r.total.won > 0 && <span className="text-[11px] font-normal" style={{ color: '#047857' }}> ·{r.total.won}</span>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 font-semibold text-slate-800">
            <td className="py-2 pr-3">Tổng</td>
            {pivot.cols.map((c) => {
              const t = pivot.colTotals[c.key] ?? { leads: 0, won: 0 };
              return (
                <td key={c.key} className="py-2 px-3 text-center">
                  {fmt(t.leads)}{t.won > 0 && <span className="text-[11px] font-normal" style={{ color: '#047857' }}> ·{t.won}</span>}
                </td>
              );
            })}
            <td className="py-2 pl-3 text-right" style={{ color: BRAND }}>
              {fmt(pivot.grandTotal.leads)}{pivot.grandTotal.won > 0 && <span className="text-[11px] font-normal" style={{ color: '#047857' }}> ·{pivot.grandTotal.won}</span>}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="text-[11px] text-slate-400 mt-2">Số lớn = lead · số xanh = ký HĐ. Ô đậm màu = nhiều lead hơn.</p>
    </div>
  );
}

function TrendChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div>
      <div className="text-xs text-slate-400 mb-3">Tổng {fmt(total)} lead trong {data.length} ngày</div>
      <div className="flex items-end gap-1 h-40">
        {data.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center justify-end group min-w-0" title={`${d.date}: ${d.count} lead`}>
            <span className="text-[10px] text-slate-400 mb-0.5 opacity-0 group-hover:opacity-100">{d.count}</span>
            <div className="w-full rounded-t" style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 3 : 0, background: BRAND }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

// Dropdown popup (đồng bộ style filter của trang Lead).
function Dropdown({ value, onChange, placeholder, options }: {
  value: string; onChange: (v: string) => void; placeholder: string; options: Opt[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const active = value !== '';
  const current = options.find((o) => o.value === value);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 180) });
    setOpen(true);
  };
  const pick = (v: string) => { onChange(v); setOpen(false); };

  return (
    <>
      <button ref={btnRef} onClick={toggle}
        className="inline-flex items-center justify-between gap-1.5 text-sm border rounded-lg px-2.5 py-1.5 outline-none transition-colors min-w-[150px]"
        style={{
          borderColor: active ? BRAND : '#e2e8f0',
          background: active ? '#e6f0fa' : '#fff',
          color: active ? BRAND : '#64748b',
          fontWeight: active ? 600 : 400,
        }}>
        <span className="truncate">{active ? (current?.label ?? value) : placeholder}</span>
        <ChevronDown size={13} className="opacity-60 shrink-0" />
      </button>
      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, maxHeight: 280, overflowY: 'auto',
          }}>
            <button onClick={() => pick('')}
              className="block w-full text-left text-sm rounded-md px-2.5 py-1.5 hover:bg-slate-50"
              style={{ color: !active ? BRAND : '#475569', fontWeight: !active ? 600 : 400 }}>
              {placeholder}
            </button>
            {options.map((o) => (
              <button key={o.value} onClick={() => pick(o.value)}
                className="block w-full text-left text-sm rounded-md px-2.5 py-1.5 hover:bg-slate-50"
                style={{ color: value === o.value ? BRAND : '#475569', fontWeight: value === o.value ? 600 : 400 }}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
