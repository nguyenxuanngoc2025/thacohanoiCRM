'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, PhoneCall, TrendingUp, FileSignature, Clock, XCircle, LayoutDashboard, Table2 } from 'lucide-react';
import { computeKpis, type ReportLead } from '@/lib/reports';
import { sourcePlatform } from '@/lib/source';
import { STATUS_LABEL, type LeadStatus } from '@/lib/lead-status';
import { Dropdown, uniqOpts, BRAND, fmt, type Opt } from './ui';
import OverviewTab from './OverviewTab';
import TablesTab from './TablesTab';

export type RangeKey = 'this_month' | 'last_month' | '30d' | 'custom';
type Tab = 'overview' | 'tables';

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

  const [tab, setTab] = useState<Tab>('overview');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [showroom, setShowroom] = useState('');
  const [source, setSource] = useState('');
  const [assignee, setAssignee] = useState('');
  const [status, setStatus] = useState('');
  const [cFrom, setCFrom] = useState(from);
  const [cTo, setCTo] = useState(to);

  const brandOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.brand_id, l.brand_name]), [leads]);
  // Dòng xe lọc theo thương hiệu đang chọn (nếu có) — đúng quan hệ cấp con của thương hiệu.
  const modelOpts = useMemo<Opt[]>(
    () => uniqOpts(brand ? leads.filter((l) => l.brand_id === brand) : leads, (l) => [l.model_id, l.model_name]),
    [leads, brand],
  );
  const showroomOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.showroom_id, l.showroom_name]), [leads]);
  // Nguồn = nguồn marketing CHÍNH (Facebook, Google…). fb_message/fb_comment/lead ads chỉ là chi tiết kênh.
  const sourceOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.source ? sourcePlatform(l.source) : null, l.source ? sourcePlatform(l.source) : null]), [leads]);
  const assigneeOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.assigned_to, l.assignee_name]), [leads]);
  const statusOpts = useMemo<Opt[]>(
    () => uniqOpts(leads, (l) => [l.status, l.status ? STATUS_LABEL[l.status as LeadStatus] : null]),
    [leads],
  );

  // Đổi thương hiệu thì bỏ dòng xe đang chọn (tránh chọn dòng xe của hãng khác).
  const onBrand = (v: string) => { setBrand(v); setModel(''); };
  const hasFilter = brand || model || showroom || source || assignee || status;
  const clearFilters = () => { setBrand(''); setModel(''); setShowroom(''); setSource(''); setAssignee(''); setStatus(''); };

  const filtered = useMemo(
    () => leads.filter((l) =>
      (!brand || l.brand_id === brand) &&
      (!model || l.model_id === model) &&
      (!showroom || l.showroom_id === showroom) &&
      (!source || (l.source ? sourcePlatform(l.source) === source : false)) &&
      (!assignee || l.assigned_to === assignee) &&
      (!status || l.status === status)),
    [leads, brand, model, showroom, source, assignee, status],
  );

  const kpis = useMemo(() => computeKpis(filtered, nowMs), [filtered, nowMs]);
  const setRange = (r: RangeKey) => router.push(`/reports?range=${r}`);
  const applyCustom = () => router.push(`/reports?range=custom&from=${cFrom}&to=${cTo}`);

  return (
    <div className="p-6 space-y-5">
      {/* Header + thời gian */}
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
            <button key={k} onClick={() => setRange(k)}
              className="text-sm rounded-lg px-3 py-1.5 border transition-colors"
              style={range === k
                ? { background: '#e6f0fa', borderColor: BRAND, color: BRAND, fontWeight: 600 }
                : { background: '#fff', borderColor: '#e2e8f0', color: '#64748b' }}>
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

      {/* Lọc nhanh */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Lọc nhanh</span>
        <Dropdown value={brand} onChange={onBrand} placeholder="Tất cả thương hiệu" options={brandOpts} />
        <Dropdown value={model} onChange={setModel} placeholder="Tất cả dòng xe" options={modelOpts} />
        <Dropdown value={showroom} onChange={setShowroom} placeholder="Tất cả showroom" options={showroomOpts} />
        <Dropdown value={source} onChange={setSource} placeholder="Tất cả nguồn" options={sourceOpts} />
        <Dropdown value={assignee} onChange={setAssignee} placeholder="Tất cả TVBH" options={assigneeOpts} />
        <Dropdown value={status} onChange={setStatus} placeholder="Tất cả trạng thái" options={statusOpts} />
        {hasFilter && (
          <button onClick={clearFilters}
            className="text-xs text-rose-600 hover:underline">Xoá lọc</button>
        )}
      </div>

      {/* KPI strip — luôn hiển thị */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi icon={<Users size={16} />} label="Tổng lead" value={fmt(kpis.total)} tone="#0f172a" />
        <Kpi icon={<PhoneCall size={16} />} label="Đã liên hệ" value={fmt(kpis.contacted)} sub={`${kpis.contactRate}%`} tone="#1d4ed8" />
        <Kpi icon={<TrendingUp size={16} />} label="Đang theo dõi" value={fmt(kpis.following)} tone="#b45309" />
        <Kpi icon={<FileSignature size={16} />} label="Ký hợp đồng" value={fmt(kpis.won)} sub={`Tỉ lệ chốt ${kpis.winRate}%`} tone="#047857" />
        <Kpi icon={<Clock size={16} />} label="Quá hạn liên hệ" value={fmt(kpis.overdue)} tone="#be123c" />
        <Kpi icon={<XCircle size={16} />} label="Loại" value={fmt(kpis.fail)} sub={`${kpis.failRate}%`} tone="#64748b" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')} icon={<LayoutDashboard size={15} />}>Tổng quan</TabBtn>
        <TabBtn active={tab === 'tables'} onClick={() => setTab('tables')} icon={<Table2 size={15} />}>Bảng dữ liệu</TabBtn>
      </div>

      {tab === 'overview'
        ? <OverviewTab leads={filtered} fromMs={fromMs} toMs={toMs} />
        : <TablesTab leads={filtered} />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm px-4 py-2.5 -mb-px border-b-2 transition-colors"
      style={active
        ? { borderColor: BRAND, color: BRAND, fontWeight: 600 }
        : { borderColor: 'transparent', color: '#94a3b8' }}>
      {icon} {children}
    </button>
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
