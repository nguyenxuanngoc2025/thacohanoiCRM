'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import LeadsTable, { type LeadRow, type Filters, EMPTY_FILTERS, applyScope } from './LeadsTable';
import { isContacted } from '@/lib/lead-status';

export interface StatCard {
  label: string;
  value: string | number;
  color: string;
  bg: string;
}

export interface ModelOption {
  id: string;
  name: string;
  brand_id: string;
}

export interface BrandOption { id: string; name: string }
export interface ShowroomOption { id: string; name: string }
export interface AssigneeOption { id: string; full_name: string }

const THRESHOLD = 140; // px cuộn trong bảng để thu hết card

export default function LeadsView({
  leads, models, brands, showrooms, assignees, canCreate, canAssign,
}: {
  leads: LeadRow[];
  models: ModelOption[];
  brands: BrandOption[];
  showrooms: ShowroomOption[];
  assignees: AssigneeOption[];
  canCreate: boolean;
  canAssign: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  // Tập lead theo bộ lọc phạm vi → KPI cards tính từ đây để "nhảy" theo filter.
  const scoped = useMemo(() => applyScope(leads, filters), [leads, filters]);

  const cards = useMemo<StatCard[]>(() => {
    const total = scoped.length;
    const contacted = scoped.filter((l) => isContacted(l.last_contact_at)).length;
    const pending = total - contacted;
    const rate = total ? Math.round((contacted / total) * 100) : 0;
    const gdtd = scoped.filter((l) => l.status === 'GDTD').length;
    return [
      { label: 'Tổng lead', value: total, color: '#004B9B', bg: '#e6f0fa' },
      { label: 'Chưa liên hệ', value: pending, color: '#b45309', bg: '#fffbeb' },
      { label: 'Đã liên hệ', value: contacted, color: '#047857', bg: '#ecfdf5' },
      { label: 'Tỷ lệ liên hệ', value: `${rate}%`, color: '#0468BF', bg: '#e6f0fa' },
      { label: 'GDTD', value: gdtd, color: '#7c3aed', bg: '#f5f3ff' },
    ];
  }, [scoped]);

  useEffect(() => {
    const scroller = rootRef.current?.querySelector<HTMLElement>('[data-table-scroll]');
    const cardsEl = cardsRef.current;
    if (!scroller || !cardsEl) return;

    let raf = 0;
    const apply = () => {
      raf = 0;
      const p = Math.min(scroller.scrollTop / THRESHOLD, 1); // 0 = hiện đủ, 1 = ẩn hết
      cardsEl.style.opacity = String(1 - p);
      cardsEl.style.maxHeight = `${(1 - p) * 200}px`;
      cardsEl.style.marginBottom = `${(1 - p) * 24}px`;
      cardsEl.style.transform = `translateY(${-p * 12}px)`;
      cardsEl.style.pointerEvents = p > 0.8 ? 'none' : 'auto';
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    apply();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={rootRef} className="h-full flex flex-col p-6">
      <div className="shrink-0 mb-6">
        <h1 className="text-xl font-bold text-slate-900">Lead khách hàng</h1>
        <p className="text-sm text-slate-400 mt-0.5">Theo dõi lead đã liên hệ chưa và phân loại</p>
      </div>

      <div
        ref={cardsRef}
        className="shrink-0 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-hidden"
        style={{ transition: 'opacity 0.15s, transform 0.15s', willChange: 'opacity, transform, max-height' }}
      >
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: c.color }}>{c.label}</div>
            <div className="text-3xl font-bold text-slate-900 mt-2">{c.value}</div>
            <div className="mt-3 h-1 rounded-full" style={{ background: c.bg }} />
          </div>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <LeadsTable
          leads={scoped}
          allLeads={leads}
          filters={filters}
          setFilters={setFilters}
          models={models}
          brands={brands}
          showrooms={showrooms}
          assignees={assignees}
          canCreate={canCreate}
          canAssign={canAssign}
        />
      </div>
    </div>
  );
}
