'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, FunnelChart, Funnel, LabelList,
} from 'recharts';
import {
  computeFunnel, groupBySource, groupByShowroom, groupByBrand,
  dailyTrend, statusDistribution, type ReportLead,
} from '@/lib/reports';
import { STATUS_COLOR } from '@/lib/lead-status';
import { Panel, PALETTE, BRAND, fmt } from './ui';

const AXIS = { fontSize: 11, fill: '#94a3b8' };

export default function OverviewTab({
  leads, fromMs, toMs,
}: { leads: ReportLead[]; fromMs: number; toMs: number }) {
  const funnel = useMemo(() => computeFunnel(leads), [leads]);
  const statusDist = useMemo(() => statusDistribution(leads), [leads]);
  const byBrand = useMemo(() => groupByBrand(leads, Date.now()), [leads]);
  const bySource = useMemo(() => groupBySource(leads, Date.now()), [leads]);
  const byShowroom = useMemo(() => groupByShowroom(leads, Date.now()), [leads]);
  const trend = useMemo(() => dailyTrend(leads, fromMs, toMs), [leads, fromMs, toMs]);

  const funnelData = funnel.map((s, i) => ({ name: s.label, value: s.count, pct: s.pct, fill: PALETTE[i % PALETTE.length] }));
  const statusData = statusDist.map((s) => ({ name: s.label, value: s.count, code: s.code }));
  const brandData = byBrand.map((r) => ({ name: r.label, value: r.leads }));
  const sourceData = bySource.slice(0, 8).map((r) => ({ name: r.label, lead: r.leads, won: r.won }));
  const showroomData = byShowroom.map((r) => ({ name: shorten(r.label), lead: r.leads, won: r.won, winRate: r.winRate }));
  const trendData = trend.map((d) => ({ date: d.date.slice(5), count: d.count }));

  return (
    <div className="space-y-5">
      {/* Phễu + Xu hướng */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Phễu chuyển đổi" desc="Số lead còn lại qua từng bậc">
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <FunnelChart>
                <Tooltip content={<TipFunnel />} />
                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                  <LabelList position="right" fill="#475569" stroke="none" dataKey="name" style={{ fontSize: 12 }} />
                  <LabelList position="left" fill="#0f172a" stroke="none" dataKey="value" style={{ fontSize: 12, fontWeight: 700 }} />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
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

      {/* Donut trạng thái + Pie thương hiệu */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Phân bổ theo trạng thái">
          <DonutOrEmpty data={statusData} colorOf={(d) => STATUS_COLOR[d.code as keyof typeof STATUS_COLOR] ?? '#cbd5e1'} />
        </Panel>
        <Panel title="Cơ cấu theo thương hiệu">
          <DonutOrEmpty data={brandData} colorOf={(_d, i) => PALETTE[i % PALETTE.length]} />
        </Panel>
      </div>

      {/* Bar nguồn + Bar showroom */}
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

      {byShowroom.length > 0 && (
        <Panel title="Hiệu quả theo showroom" desc="Cột: số lead & ký HĐ — đường: tỉ lệ chốt (%)">
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={showroomData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={4}>
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
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function TipFunnel({ active, payload }: { active?: boolean; payload?: TipPayload[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return box(<><div className="font-semibold text-slate-700">{p.name}</div><div className="text-slate-500">{fmt(p.value)} lead · {p.payload?.pct}%</div></>);
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
