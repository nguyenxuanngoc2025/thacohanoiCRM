'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import LeadsTable, { type LeadRow, type Filters, EMPTY_FILTERS, applyScope } from './LeadsTable';
import { isContacted } from '@/lib/lead-status';

export interface StatCard {
  label: string;
  value: string | number;
  accent?: boolean; // chỉ số trọng tâm được tô nhẹ điểm nhấn
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
      { label: 'Tổng lead', value: total, accent: true },
      { label: 'Chưa liên hệ', value: pending },
      { label: 'Đã liên hệ', value: contacted },
      { label: 'Tỷ lệ liên hệ', value: `${rate}%` },
      { label: 'GDTD', value: gdtd },
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
      <div
        ref={cardsRef}
        className="shrink-0 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 overflow-hidden"
        style={{ transition: 'opacity 0.15s, transform 0.15s', willChange: 'opacity, transform, max-height' }}
      >
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3.5"
          >
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{c.label}</div>
            <div
              className="text-2xl font-semibold mt-1 tabular-nums"
              style={{ color: c.accent ? '#004B9B' : '#0f172a' }}
            >
              {c.value}
            </div>
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
