'use client';

import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Users, PhoneCall, TrendingUp, FileSignature, Clock, XCircle, LayoutDashboard, Table2, BarChart2, GitBranch, Radio, ListFilter } from 'lucide-react';
import { compareKpis, type ReportLead, type ReportLevel } from '@/lib/reports';
import { type RangeKey } from '@/lib/report-range';
import { sourcePlatform, type SourceCatalog } from '@/lib/source';
import { STATUS_LABEL, type LeadStatus } from '@/lib/lead-status';
import { Dropdown, uniqOpts, BRAND, fmt, DeltaArrow, type Opt } from './ui';
import { tabsForLevel, defaultTab, dimensionsForLevel, type ReportTab } from './report-level';
import OverviewTab from './OverviewTab';
import TablesTab from './TablesTab';
import RankingTab from './tabs/RankingTab';
import ManagementTab from './tabs/ManagementTab';
import SourceTab from './tabs/SourceTab';

const RANGE_OPTS: Opt[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'this_week', label: 'Tuần này' },
  { value: 'this_month', label: 'Tháng này' },
  { value: 'last_month', label: 'Tháng trước' },
  { value: '30d', label: '30 ngày' },
  { value: 'custom', label: 'Tùy chọn ngày…' },
];

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
  leads, prevLeads, sourceCatalog, range, from, to, fromMs, toMs, showB10, reportLevel, marketing,
}: {
  leads: ReportLead[];
  prevLeads: ReportLead[];
  sourceCatalog: SourceCatalog;
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
  const sourceOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.source ? sourcePlatform(l.source, sourceCatalog) : null, l.source ? sourcePlatform(l.source, sourceCatalog) : null]), [leads, sourceCatalog]);
  const assigneeOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.assigned_to, l.assignee_name]), [leads]);
  const statusOpts = useMemo<Opt[]>(
    () => uniqOpts(leads, (l) => [l.status, l.status ? STATUS_LABEL[l.status as LeadStatus] : null]),
    [leads],
  );

  const onBrand = (v: string) => { setBrand(v); setModel(''); };
  const hasFilter = brand || model || showroom || source || assignee || status;
  const activeFilters = [brand, model, showroom, source, assignee, status].filter(Boolean).length;
  const clearFilters = () => { setBrand(''); setModel(''); setShowroom(''); setSource(''); setAssignee(''); setStatus(''); };

  const [openFilter, setOpenFilter] = useState(false);
  const [filterPos, setFilterPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const toggleFilter = () => {
    if (openFilter) { setOpenFilter(false); return; }
    const r = filterBtnRef.current?.getBoundingClientRect();
    if (r) {
      const width = Math.min(Math.max(r.width, 460), window.innerWidth - 24);
      let left = r.left;
      if (left + width > window.innerWidth - 12) left = window.innerWidth - 12 - width;
      setFilterPos({ top: r.bottom + 6, left: Math.max(12, left), width });
    }
    setOpenFilter(true);
  };

  // Bộ lọc dùng chung cho cả kỳ hiện tại và kỳ trước
  const applyFilters = (list: ReportLead[]) =>
    list.filter((l) =>
      (!brand || l.brand_id === brand) &&
      (!model || l.model_id === model) &&
      (!showroom || l.showroom_id === showroom) &&
      (!source || (l.source ? sourcePlatform(l.source, sourceCatalog) === source : false)) &&
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

  const setRange = (r: string) => {
    if (r === 'custom') { router.push(`/reports?range=custom&from=${cFrom}&to=${cTo}`); return; }
    router.push(`/reports?range=${r}`);
  };
  const applyCustom = () => router.push(`/reports?range=custom&from=${cFrom}&to=${cTo}`);

  // Label kỳ cho ManagementTab
  const periodLabel: string = useMemo(() => {
    if (range === 'today') return 'Hôm nay';
    if (range === 'this_week') return 'Tuần này';
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
          <div className="w-44">
            <Dropdown value={range} onChange={setRange} placeholder="Thời gian" options={RANGE_OPTS} allowClear={false} />
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-1.5 border rounded-lg px-2 py-1" style={{ borderColor: BRAND, background: '#e6f0fa' }}>
              <input type="date" value={cFrom} max={cTo} onChange={(e) => setCFrom(e.target.value)}
                className="text-sm bg-transparent outline-none text-slate-700" />
              <span className="text-slate-300">–</span>
              <input type="date" value={cTo} min={cFrom} onChange={(e) => setCTo(e.target.value)}
                className="text-sm bg-transparent outline-none text-slate-700" />
              <button onClick={applyCustom} className="text-xs font-semibold rounded-md px-2 py-1 text-white" style={{ background: BRAND }}>
                Áp dụng
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bộ lọc — gộp thành 1 nút, mở popup */}
      <div className="flex items-center gap-2">
        <button ref={filterBtnRef} onClick={toggleFilter}
          className="inline-flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 transition-colors"
          style={hasFilter
            ? { borderColor: BRAND, background: '#e6f0fa', color: BRAND, fontWeight: 600 }
            : { borderColor: '#e2e8f0', background: '#fff', color: '#64748b' }}>
          <ListFilter size={14} /> Bộ lọc
          {activeFilters > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold text-white" style={{ background: BRAND }}>
              {activeFilters}
            </span>
          )}
        </button>
        {hasFilter && (
          <button onClick={clearFilters} className="text-xs text-rose-600 hover:underline">Xoá lọc</button>
        )}
      </div>
      {openFilter && filterPos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpenFilter(false)} />
          <div style={{
            position: 'fixed', top: filterPos.top, left: filterPos.left, width: filterPos.width, zIndex: 9999,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            boxShadow: '0 12px 32px rgba(0,0,0,0.14)', padding: 14, maxHeight: '80vh', overflowY: 'auto',
          }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-slate-800">Bộ lọc</span>
              {hasFilter && (
                <button onClick={clearFilters} className="text-xs text-rose-600 hover:underline">Xoá lọc</button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <FilterField label="Thương hiệu"><Dropdown value={brand} onChange={onBrand} placeholder="Tất cả thương hiệu" options={brandOpts} /></FilterField>
              <FilterField label="Dòng xe"><Dropdown value={model} onChange={setModel} placeholder="Tất cả dòng xe" options={modelOpts} /></FilterField>
              <FilterField label="Showroom"><Dropdown value={showroom} onChange={setShowroom} placeholder="Tất cả showroom" options={showroomOpts} /></FilterField>
              <FilterField label="Nguồn"><Dropdown value={source} onChange={setSource} placeholder="Tất cả nguồn" options={sourceOpts} /></FilterField>
              <FilterField label="TVBH"><Dropdown value={assignee} onChange={setAssignee} placeholder="Tất cả TVBH" options={assigneeOpts} /></FilterField>
              <FilterField label="Trạng thái"><Dropdown value={status} onChange={setStatus} placeholder="Tất cả trạng thái" options={statusOpts} /></FilterField>
            </div>
          </div>
        </>,
        document.body,
      )}

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
        <OverviewTab leads={filtered} fromMs={fromMs} toMs={toMs} reportLevel={reportLevel} prevLeads={filteredPrev} sourceCatalog={sourceCatalog} />
      )}
      {tab === 'ranking' && (
        <RankingTab leads={filtered} prevLeads={filteredPrev} level={reportLevel} showB10={showB10} />
      )}
      {tab === 'management' && (
        <ManagementTab leads={filtered} prevLeads={filteredPrev} level={reportLevel} showB10={showB10} periodLabel={periodLabel} sourceCatalog={sourceCatalog} />
      )}
      {tab === 'source' && (
        <SourceTab leads={filtered} prevLeads={filteredPrev} fromMs={fromMs} toMs={toMs} showB10={showB10} sourceCatalog={sourceCatalog} />
      )}
      {tab === 'tables' && (
        <TablesTab leads={filtered} showB10={showB10} dims={dimensionsForLevel(reportLevel)} sourceCatalog={sourceCatalog} />
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
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
