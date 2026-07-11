'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, PhoneCall, TrendingUp, FileSignature, Clock, XCircle, LayoutDashboard, Table2, BarChart2, GitBranch, Radio } from 'lucide-react';
import { compareKpis, type ReportLead, type ReportLevel } from '@/lib/reports';
import { sourcePlatform } from '@/lib/source';
import { STATUS_LABEL, type LeadStatus } from '@/lib/lead-status';
import { Dropdown, uniqOpts, BRAND, fmt, DeltaArrow, type Opt } from './ui';
import { tabsForLevel, defaultTab, dimensionsForLevel, type ReportTab } from './report-level';
import OverviewTab from './OverviewTab';
import TablesTab from './TablesTab';
import RankingTab from './tabs/RankingTab';
import ManagementTab from './tabs/ManagementTab';
import SourceTab from './tabs/SourceTab';

export type RangeKey = 'this_month' | 'last_month' | '30d' | 'custom';

const TAB_LABELS: Record<ReportTab, string> = {
  overview: 'Tổng quan',
  ranking: 'Xếp hạng',
  management: 'Bảng quản trị',
  source: 'Nguồn & Kênh',
  tables: 'Bảng chi tiết',
};

const TAB_ICONS: Record<ReportTab, React.ReactNode> = {
  overview: <LayoutDashboard size={15} />,
  ranking: <BarChart2 size={15} />,
  management: <GitBranch size={15} />,
  source: <Radio size={15} />,
  tables: <Table2 size={15} />,
};

export default function ReportsView({
  leads, prevLeads, range, from, to, fromMs, toMs, showB10, reportLevel, marketing,
}: {
  leads: ReportLead[];
  prevLeads: ReportLead[];
  range: RangeKey;
  from: string;
  to: string;
  fromMs: number;
  toMs: number;
  showB10: boolean;
  reportLevel: ReportLevel;
  marketing: boolean;
}) {
  const router = useRouter();
  const nowMs = useMemo(() => Date.now(), []);

  const tabs = tabsForLevel(reportLevel);
  const [tab, setTab] = useState<ReportTab>(defaultTab(reportLevel, marketing));
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [showroom, setShowroom] = useState('');
  const [source, setSource] = useState('');
  const [assignee, setAssignee] = useState('');
  const [status, setStatus] = useState('');
  const [cFrom, setCFrom] = useState(from);
  const [cTo, setCTo] = useState(to);

  const brandOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.brand_id, l.brand_name]), [leads]);
  const modelOpts = useMemo<Opt[]>(
    () => uniqOpts(brand ? leads.filter((l) => l.brand_id === brand) : leads, (l) => [l.model_id, l.model_name]),
    [leads, brand],
  );
  const showroomOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.showroom_id, l.showroom_name]), [leads]);
  const sourceOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.source ? sourcePlatform(l.source) : null, l.source ? sourcePlatform(l.source) : null]), [leads]);
  const assigneeOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.assigned_to, l.assignee_name]), [leads]);
  const statusOpts = useMemo<Opt[]>(
    () => uniqOpts(leads, (l) => [l.status, l.status ? STATUS_LABEL[l.status as LeadStatus] : null]),
    [leads],
  );

  const onBrand = (v: string) => { setBrand(v); setModel(''); };
  const hasFilter = brand || model || showroom || source || assignee || status;
  const clearFilters = () => { setBrand(''); setModel(''); setShowroom(''); setSource(''); setAssignee(''); setStatus(''); };

  // Bộ lọc dùng chung cho cả kỳ hiện tại và kỳ trước
  const applyFilters = (list: ReportLead[]) =>
    list.filter((l) =>
      (!brand || l.brand_id === brand) &&
      (!model || l.model_id === model) &&
      (!showroom || l.showroom_id === showroom) &&
      (!source || (l.source ? sourcePlatform(l.source) === source : false)) &&
      (!assignee || l.assigned_to === assignee) &&
      (!status || l.status === status));

  const filtered = useMemo(() => applyFilters(leads), [leads, brand, model, showroom, source, assignee, status]);
  const filteredPrev = useMemo(() => applyFilters(prevLeads), [prevLeads, brand, model, showroom, source, assignee, status]);

  // So sánh KPI 2 kỳ
  const cmp = useMemo(() => compareKpis(filtered, filteredPrev, nowMs), [filtered, filteredPrev, nowMs]);
  const kpis = cmp.current;

  // Delta tỷ lệ (% - % = điểm %)
  const contactRate = (k: typeof kpis) => (k.total ? (k.contacted / k.total) * 100 : 0);
  const contactRateDelta = contactRate(cmp.current) - contactRate(cmp.previous);
  const winRateDelta = cmp.current.winRate - cmp.previous.winRate;

  const setRange = (r: RangeKey) => router.push(`/reports?range=${r}`);
  const applyCustom = () => router.push(`/reports?range=custom&from=${cFrom}&to=${cTo}`);

  // Label kỳ cho ManagementTab
  const periodLabel: string = useMemo(() => {
    if (range === 'this_month') return 'Tháng này';
    if (range === 'last_month') return 'Tháng trước';
    if (range === '30d') return '30 ngày';
    // custom: dd/mm–dd/mm
    const fmt2 = (s: string) => { const d = new Date(s); return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`; };
    return `${fmt2(from)}–${fmt2(to)}`;
  }, [range, from, to]);

  const isPersonal = reportLevel === 'personal';

  return (
    <div className="p-4 sm:p-6 space-y-5">
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
          <button onClick={clearFilters} className="text-xs text-rose-600 hover:underline">Xoá lọc</button>
        )}
      </div>

      {/* KPI strip — với delta so kỳ trước */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi
          icon={<Users size={16} />}
          label={isPersonal ? 'Lead được giao' : 'Tổng lead'}
          value={fmt(kpis.total)}
          tone="#0f172a"
          delta={cmp.delta.total}
        />
        <Kpi
          icon={<PhoneCall size={16} />}
          label={isPersonal ? 'Đã liên hệ' : 'Tỷ lệ liên hệ'}
          value={isPersonal ? fmt(kpis.contacted) : `${contactRate(kpis).toFixed(1)}%`}
          tone="#1d4ed8"
          delta={contactRateDelta}
          deltaPct
        />
        <Kpi
          icon={<TrendingUp size={16} />}
          label="Đang giao dịch"
          value={fmt(kpis.following)}
          tone="#b45309"
          delta={cmp.delta.following}
        />
        <Kpi
          icon={<FileSignature size={16} />}
          label={isPersonal ? 'Đã chốt' : 'Đã chốt'}
          value={fmt(kpis.won)}
          tone="#047857"
          delta={cmp.delta.won}
        />
        <Kpi
          icon={<XCircle size={16} />}
          label={isPersonal ? 'Tỷ lệ chốt của tôi' : 'Tỷ lệ chốt'}
          value={`${kpis.winRate}%`}
          tone="#047857"
          delta={winRateDelta}
          deltaPct
        />
        <Kpi
          icon={<Clock size={16} />}
          label={isPersonal ? 'Quá hạn cần gọi' : 'Quá hạn'}
          value={fmt(kpis.overdue)}
          tone="#be123c"
          valueRed
          delta={cmp.delta.overdue}
          positiveIsGood={false}
        />
      </div>

      {/* Tabs — chỉ render tab thuộc cấp */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <TabBtn key={t} active={tab === t} onClick={() => setTab(t)} icon={TAB_ICONS[t]}>
            {TAB_LABELS[t]}
          </TabBtn>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab leads={filtered} fromMs={fromMs} toMs={toMs} reportLevel={reportLevel} prevLeads={filteredPrev} />
      )}
      {tab === 'ranking' && (
        <RankingTab leads={filtered} prevLeads={filteredPrev} level={reportLevel} showB10={showB10} />
      )}
      {tab === 'management' && (
        <ManagementTab leads={filtered} prevLeads={filteredPrev} level={reportLevel} showB10={showB10} periodLabel={periodLabel} />
      )}
      {tab === 'source' && (
        <SourceTab leads={filtered} prevLeads={filteredPrev} fromMs={fromMs} toMs={toMs} showB10={showB10} />
      )}
      {tab === 'tables' && (
        <TablesTab leads={filtered} showB10={showB10} dims={dimensionsForLevel(reportLevel)} />
      )}
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

function Kpi({
  icon, label, value, tone, delta, deltaPct, positiveIsGood = true, valueRed,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
  delta?: number;
  deltaPct?: boolean;
  positiveIsGood?: boolean;
  valueRed?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 text-slate-400">
        <span style={{ color: tone }}>{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold" style={{ color: valueRed ? '#be123c' : tone }}>{value}</div>
      {delta !== undefined && (
        <div className="mt-0.5">
          <DeltaArrow delta={delta} positiveIsGood={positiveIsGood} pct={deltaPct} />
        </div>
      )}
    </div>
  );
}
