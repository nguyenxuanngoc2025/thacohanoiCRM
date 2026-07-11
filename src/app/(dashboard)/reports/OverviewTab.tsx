'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  computeFunnel, groupBySource, groupByBrand, groupByDimension,
  dailyTrend, statusDistribution, childDimension, isOverdue,
  DIMENSION_LABEL, type ReportLead, type ReportLevel,
} from '@/lib/reports';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/lead-status';
import { Panel, PALETTE, BRAND, fmt } from './ui';

const AXIS = { fontSize: 11, fill: '#94a3b8' };

export default function OverviewTab({
  leads, fromMs, toMs, reportLevel, prevLeads,
}: {
  leads: ReportLead[];
  fromMs: number;
  toMs: number;
  reportLevel: ReportLevel;
  prevLeads: ReportLead[];
}) {
  const now = Date.now();
  const childDim = childDimension(reportLevel);

  const funnel = useMemo(() => computeFunnel(leads), [leads]);
  const statusDist = useMemo(() => statusDistribution(leads), [leads]);
  const byBrand = useMemo(() => groupByBrand(leads, now), [leads]);
  const bySource = useMemo(() => groupBySource(leads, now), [leads]);
  const byChild = useMemo(
    () => (childDim ? groupByDimension(leads, childDim, now) : []),
    [leads, childDim],
  );
  const trend = useMemo(() => dailyTrend(leads, fromMs, toMs), [leads, fromMs, toMs]);
  const overdueLeads = useMemo(
    () => (reportLevel === 'personal' ? leads.filter((l) => isOverdue(l, now)) : []),
    [leads, reportLevel],
  );

  const statusData = statusDist.map((s) => ({ name: s.label, value: s.count, code: s.code }));
  const brandData = byBrand.map((r) => ({ name: r.label, value: r.leads }));
  const sourceData = bySource.slice(0, 8).map((r) => ({ name: r.label, lead: r.leads, won: r.won }));
  const childData = byChild.map((r) => ({ name: shorten(r.label), lead: r.leads, won: r.won, winRate: r.winRate }));
  const trendData = trend.map((d) => ({ date: d.date.slice(5), count: d.count }));

  const showBrandDonut = reportLevel === 'company' || reportLevel === 'showroom';

  return (
    <div className="space-y-5">
      {/* Phễu + Xu hướng */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Phễu chuyển đổi" desc="Số lead còn lại qua từng bậc">
          <FunnelBars funnel={funnel} />
        </Panel>

        <Panel title="Lead mới theo ngày" desc={`Tổng ${fmt(trend.reduce((s, d) => s + d.count, 0))} lead`}>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradLead" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <Tooltip content={<TipGeneric unit="lead" />} />
                <Area type="monotone" dataKey="count" name="Lead" stroke={BRAND} strokeWidth={2} fill="url(#gradLead)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Donut trạng thái + Pie thương hiệu (chỉ hiện ở cấp công ty / showroom) */}
      <div className={`grid grid-cols-1 gap-5 ${showBrandDonut ? 'lg:grid-cols-2' : ''}`}>
        <Panel title="Phân bổ theo trạng thái">
          <DonutOrEmpty data={statusData} colorOf={(d) => STATUS_COLOR[d.code as keyof typeof STATUS_COLOR] ?? '#cbd5e1'} />
        </Panel>
        {showBrandDonut && (
          <Panel title="Cơ cấu theo thương hiệu">
            <DonutOrEmpty data={brandData} colorOf={(_d, i) => PALETTE[i % PALETTE.length]} />
          </Panel>
        )}
      </div>

      {/* Bar nguồn */}
      <Panel title="Lead & hợp đồng theo nguồn" desc="So sánh số lead và số ký HĐ từng kênh">
        <div style={{ height: Math.max(220, sourceData.length * 42) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sourceData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barCategoryGap={14}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={110} />
              <Tooltip content={<TipGeneric unit="lead" />} cursor={{ fill: '#f8fafc' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="lead" name="Lead" fill={BRAND} radius={[0, 4, 4, 0]} />
              <Bar dataKey="won" name="Ký HĐ" fill="#0d9488" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* So sánh cấp dưới (dynamic) hoặc danh sách gọi (personal) */}
      {childDim !== null && childData.length > 0 && (
        <Panel
          title={`So sánh ${DIMENSION_LABEL[childDim]}`}
          desc="Cột: số lead & ký HĐ — tỉ lệ chốt (%)"
        >
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={childData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" height={50} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <Tooltip content={<TipGeneric unit="lead" />} cursor={{ fill: '#f8fafc' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="lead" name="Lead" fill={BRAND} radius={[4, 4, 0, 0]} />
                <Bar dataKey="won" name="Ký HĐ" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      {reportLevel === 'personal' && (
        <Panel title="Danh sách gọi hôm nay">
          <p className="text-xs text-slate-400 mb-3">Các lead quá hạn cần liên hệ</p>
          {overdueLeads.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">Không có lead quá hạn.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 text-xs">
                    <th className="text-left py-2 pr-4 font-medium">Dòng xe</th>
                    <th className="text-left py-2 pr-4 font-medium">Trạng thái</th>
                    <th className="text-left py-2 font-medium">Hẹn gọi</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueLeads.map((l, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-4 text-slate-700">{l.model_name ?? '—'}</td>
                      <td className="py-2 pr-4 text-slate-600">
                        {l.status ? STATUS_LABEL[l.status] : 'Chưa phân loại'}
                      </td>
                      <td className="py-2 text-slate-500">
                        {l.next_contact_at
                          ? new Date(l.next_contact_at).toLocaleDateString('vi-VN')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Bảng màu phễu: xanh đậm → xanh ngọc, thu dần theo bậc. */
const FUNNEL_COLORS = ['#003a78', '#004B9B', '#1d6fc9', '#0891b2', '#0d9488'];

/**
 * Phễu chuyển đổi kiểu dashboard: thanh ngang căn giữa thu hẹp dần theo số lead,
 * số nằm trong thanh, cột phải là % so tổng, giữa các bậc là tỉ lệ chuyển đổi.
 */
function FunnelBars({ funnel }: { funnel: { label: string; count: number; pct: number }[] }) {
  const total = funnel[0]?.count ?? 0;
  if (total === 0) return <Empty />;
  return (
    <div className="py-2">
      {funnel.map((s, i) => {
        const widthPct = Math.max((s.count / total) * 100, 6);
        const prev = funnel[i - 1];
        const conv = i > 0 && prev && prev.count > 0 ? Math.round((s.count / prev.count) * 1000) / 10 : null;
        const color = FUNNEL_COLORS[i] ?? FUNNEL_COLORS[FUNNEL_COLORS.length - 1];
        return (
          <div key={i}>
            {conv !== null && (
              <div className="flex items-center justify-center py-1">
                <span className="text-[11px] text-slate-400">↓ {conv}%</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-right text-[13px] text-slate-600 leading-tight">{s.label}</div>
              <div className="flex-1">
                <div
                  className="h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold mx-auto shadow-sm transition-all"
                  style={{ width: `${widthPct}%`, minWidth: 46, background: color }}
                >
                  {fmt(s.count)}
                </div>
              </div>
              <div className="w-12 shrink-0 text-right text-[13px] font-semibold text-slate-500">{s.pct}%</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function shorten(s: string): string {
  return s.length > 16 ? `${s.slice(0, 15)}…` : s;
}

function DonutOrEmpty({ data, colorOf }: {
  data: { name: string; value: number }[];
  colorOf: (d: { name: string; value: number; code?: string }, i: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <Empty />;
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="42%" cy="50%" innerRadius={56} outerRadius={92} paddingAngle={2} stroke="none">
            {data.map((d, i) => <Cell key={i} fill={colorOf(d as never, i)} />)}
          </Pie>
          <Tooltip content={<TipPct total={total} />} />
          <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12, lineHeight: '20px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function Empty() {
  return <div className="py-16 text-center text-slate-300 text-sm">Không có dữ liệu</div>;
}

interface TipPayload { name: string; value: number; payload?: { pct?: number; code?: string } }

function box(children: React.ReactNode) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', padding: '8px 10px', fontSize: 12 }}>
      {children}
    </div>
  );
}

function TipGeneric({ active, payload, label, unit }: { active?: boolean; payload?: TipPayload[]; label?: string; unit: string }) {
  if (!active || !payload?.length) return null;
  return box(
    <>
      {label && <div className="font-semibold text-slate-700 mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="text-slate-600">{p.name}: <b className="text-slate-800">{fmt(p.value)}</b> {unit}</div>
      ))}
    </>,
  );
}

function TipPct({ active, payload, total }: { active?: boolean; payload?: TipPayload[]; total: number }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const pct = total > 0 ? Math.round((p.value / total) * 1000) / 10 : 0;
  return box(<><div className="font-semibold text-slate-700">{p.name}</div><div className="text-slate-500">{fmt(p.value)} lead · {pct}%</div></>);
}
