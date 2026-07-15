'use client';

import React, { useMemo, useState } from 'react';
import { Copy, Check, ChevronDown, ChevronRight, Info, Store, CalendarDays } from 'lucide-react';
import { type ReportLead } from '@/lib/reports';
import { sourcePlatform, type SourceCatalog } from '@/lib/source';
import {
  buildMktPlanningReport, toChannelTsv, PLANNING_CHANNELS,
  type ModelCatalogItem, type PlanningChannel, type BrandReport,
} from '@/lib/mkt-planning-report';
import { Dropdown, BRAND, fmt, uniqOpts, type Opt } from '../ui';

const CHANNEL_TONE: Record<PlanningChannel, string> = {
  Facebook: '#1877F2', Google: '#EA4335', 'Khác': '#64748B',
};

/** 12 tháng gần nhất (gồm tháng hiện tại), mốc từ/đến theo UTC — khớp resolveRange custom. */
function monthOptions(now: Date): { value: string; label: string; from: string; to: string }[] {
  const out: { value: string; label: string; from: string; to: string }[] = [];
  const y0 = now.getUTCFullYear();
  const m0 = now.getUTCMonth();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(y0, m0 - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const mm = String(m + 1).padStart(2, '0');
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    out.push({
      value: `${y}-${mm}`, label: `Tháng ${m + 1}/${y}`,
      from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
    });
  }
  return out;
}

export default function MktPlanningTab({
  leads, models, sourceCatalog, from, to, onPickMonth,
}: {
  leads: ReportLead[];
  models: ModelCatalogItem[];
  sourceCatalog: SourceCatalog;
  from: string;
  to: string;
  onPickMonth: (from: string, to: string) => void;
}) {
  const months = useMemo(() => monthOptions(new Date()), []);
  const monthOpts: Opt[] = months.map((mo) => ({ value: mo.value, label: mo.label }));
  const selectedMonth = months.find((mo) => mo.from === from && mo.to === to)?.value ?? '';
  const pickMonth = (v: string) => { const mo = months.find((x) => x.value === v); if (mo) onPickMonth(mo.from, mo.to); };

  const showroomOpts = useMemo<Opt[]>(() => uniqOpts(leads, (l) => [l.showroom_id, l.showroom_name]), [leads]);
  const [showroom, setShowroom] = useState<string>('');
  const effShowroom = showroom || showroomOpts[0]?.value || '';

  const platformOf = useMemo(
    () => (l: ReportLead) => (l.source ? sourcePlatform(l.source, sourceCatalog) : null),
    [sourceCatalog],
  );
  const srLeads = useMemo(
    () => leads.filter((l) => String(l.showroom_id ?? '') === effShowroom),
    [leads, effShowroom],
  );
  const brandReports = useMemo(
    () => buildMktPlanningReport(srLeads, models, platformOf),
    [srLeads, models, platformOf],
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleBrand = (id: string) =>
    setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const openAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(brandReports.map((b) => b.brand_id)));

  const [copied, setCopied] = useState<string>('');
  const copyChannel = (b: BrandReport, ch: PlanningChannel) => {
    void navigator.clipboard.writeText(toChannelTsv(b, ch));
    setCopied(`${b.brand_id}|${ch}`);
    setTimeout(() => setCopied((c) => (c === `${b.brand_id}|${ch}` ? '' : c)), 1500);
  };

  const [helpOpen, setHelpOpen] = useState(false);

  const Filters = (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1"><Store size={12} /> Showroom</span>
        <div className="w-56"><Dropdown value={effShowroom} onChange={setShowroom} placeholder="Chọn showroom" options={showroomOpts} allowClear={false} /></div>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1"><CalendarDays size={12} /> Tháng</span>
        <div className="w-44"><Dropdown value={selectedMonth} onChange={pickMonth} placeholder="Chọn tháng" options={monthOpts} allowClear={false} neutral /></div>
      </label>
    </div>
  );

  if (!selectedMonth) {
    return (
      <div className="space-y-4">
        {Filters}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Hãy chọn <b>một tháng</b> ở trên để số liệu khớp đúng kỳ với bảng Kế hoạch (planning nhập theo từng tháng).
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 bg-white/95 px-1 py-2 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-3">
          {Filters}
          <div className="flex items-center gap-2">
            <button onClick={openAll} className="text-xs font-medium text-slate-500 hover:text-slate-800">Mở tất cả</button>
            <span className="text-slate-300">·</span>
            <button onClick={collapseAll} className="text-xs font-medium text-slate-500 hover:text-slate-800">Gập tất cả</button>
          </div>
        </div>
      </div>

      {/* Hướng dẫn dán — thu gọn */}
      <div className="rounded-xl border border-slate-200 bg-slate-50">
        <button onClick={() => setHelpOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700">
          <Info size={15} style={{ color: BRAND }} /> Cách dán sang Kế hoạch
          {helpOpen ? <ChevronDown size={15} className="ml-auto" /> : <ChevronRight size={15} className="ml-auto" />}
        </button>
        {helpOpen && (
          <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600 space-y-1.5">
            <p>1. Bên /planning: chọn <b>đúng Showroom + đúng Tháng</b> như bảng này, bật mode <b>THỰC HIỆN</b>.</p>
            <p>2. Tắt lọc dòng / ẩn-dòng-0, và <b>mở (không gập)</b> thương hiệu để đủ số dòng.</p>
            <p>3. Bấm nút <b>Copy</b> của kênh cần điền ở đây → sang planning bấm ô <b>KHQT dòng xe đầu tiên</b> của kênh đó → <b>Ctrl+V</b>.</p>
            <p>4. Đối chiếu tên Dòng xe 2 bên trước khi dán. Làm lần lượt cho Facebook / Google / Khác.</p>
          </div>
        )}
      </div>

      {brandReports.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
          Chưa có dữ liệu cho showroom/tháng đã chọn.
        </div>
      )}

      {brandReports.map((b) => {
        const isCollapsed = collapsed.has(b.brand_id);
        const grand = PLANNING_CHANNELS.reduce(
          (acc, ch) => { acc.khqt += b.total[ch].khqt; acc.gdtd += b.total[ch].gdtd; acc.khd += b.total[ch].khd; return acc; },
          { khqt: 0, gdtd: 0, khd: 0 },
        );
        return (
          <div key={b.brand_id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <button onClick={() => toggleBrand(b.brand_id)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
              {isCollapsed ? <ChevronRight size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              <span className="text-sm font-bold text-slate-800">{b.brand_name}</span>
              <span className="ml-auto text-xs text-slate-400">KHQT {fmt(grand.khqt)} · GDTD {fmt(grand.gdtd)} · KHĐ {fmt(grand.khd)}</span>
            </button>

            {!isCollapsed && (
              <div className="overflow-x-auto border-t border-slate-100">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th className="sticky left-0 z-[1] bg-slate-50 px-3 py-2 text-left font-semibold">Dòng xe</th>
                      {PLANNING_CHANNELS.map((ch) => (
                        <th key={ch} colSpan={3} className="border-l border-slate-200 px-3 py-2 text-center font-semibold" style={{ color: CHANNEL_TONE[ch] }}>
                          <div className="flex items-center justify-center gap-2">
                            <span>{ch}</span>
                            <button
                              onClick={() => copyChannel(b, ch)}
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors"
                              style={copied === `${b.brand_id}|${ch}`
                                ? { borderColor: '#047857', color: '#047857', background: '#ecfdf5' }
                                : { borderColor: '#cbd5e1', color: '#475569', background: '#fff' }}
                              title="Copy khối KHQT/GDTD/KHĐ mọi dòng xe của kênh này">
                              {copied === `${b.brand_id}|${ch}` ? <><Check size={12} /> Đã copy</> : <><Copy size={12} /> Copy</>}
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-slate-50 text-[11px] text-slate-400">
                      <th className="sticky left-0 z-[1] bg-slate-50 px-3 py-1" />
                      {PLANNING_CHANNELS.map((ch) => (
                        <React.Fragment key={ch}>
                          <th className="border-l border-slate-200 px-2 py-1 text-right font-medium">KHQT</th>
                          <th className="px-2 py-1 text-right font-medium">GDTD</th>
                          <th className="px-2 py-1 text-right font-medium">KHĐ</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r) => (
                      <tr key={r.model_id} className="border-t border-slate-100">
                        <td className="sticky left-0 z-[1] bg-white px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{r.model_name}</td>
                        {PLANNING_CHANNELS.map((ch) => {
                          const c = r.cells[ch];
                          const cell = (v: number, border?: boolean) => (
                            <td className={`px-2 py-2 text-right tabular-nums ${border ? 'border-l border-slate-200' : ''} ${v === 0 ? 'text-slate-300' : 'text-slate-800'}`}>{fmt(v)}</td>
                          );
                          return (
                            <React.Fragment key={ch}>
                              {cell(c.khqt, true)}{cell(c.gdtd)}{cell(c.khd)}
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-800">
                      <td className="sticky left-0 z-[1] bg-slate-50 px-3 py-2">Tổng</td>
                      {PLANNING_CHANNELS.map((ch) => (
                        <React.Fragment key={ch}>
                          <td className="border-l border-slate-200 px-2 py-2 text-right tabular-nums">{fmt(b.total[ch].khqt)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmt(b.total[ch].gdtd)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmt(b.total[ch].khd)}</td>
                        </React.Fragment>
                      ))}
                    </tr>
                  </tbody>
                </table>
                {b.unmapped > 0 && (
                  <div className="px-3 py-2 text-[11px] text-slate-400">
                    {fmt(b.unmapped)} lead chưa gán dòng xe — không tính vào bảng (bổ sung dòng xe ở popup khách để đủ số).
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
