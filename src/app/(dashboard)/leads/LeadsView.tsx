'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import LeadsTable, { type LeadRow } from './LeadsTable';
import LeadsPagination from './LeadsPagination';
import type { SourceCatalog } from '@/lib/source';
import { type LeadsQuery, queryToSearchParams } from '@/lib/leads-query';
import { createClient } from '@/lib/supabase/client';

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
export interface AssigneeOption { id: string; full_name: string; showroom_id: string | null; sales_team_id: string | null }
export interface TeamOption { id: string; name: string; showroom_id: string; brand_ids: string[] }

const THRESHOLD = 140; // px cuộn trong bảng để thu hết card

export default function LeadsView({
  leads, total, page, pageSize, stats, query,
  models, brands, showrooms, assignees, teams,
  formBrands, formShowrooms, formTeams, fixedTeamId,
  canCreate, canAssign, canDelete, b10Enabled, isTvbh, sourceCatalog,
}: {
  leads: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  stats: { total: number; contacted: number; pending: number; rate: number; gdtd: number; b10: number };
  query: LeadsQuery;
  models: ModelOption[];
  brands: BrandOption[];
  showrooms: ShowroomOption[];
  assignees: AssigneeOption[];
  teams: TeamOption[];
  // Danh sách GIỚI HẠN theo phạm vi người tạo cho form Thêm lead (khác danh sách lọc bảng).
  formBrands: BrandOption[];
  formShowrooms: ShowroomOption[];
  formTeams: TeamOption[];
  fixedTeamId: string | null;
  canCreate: boolean;
  canAssign: boolean;
  canDelete: boolean;
  b10Enabled: boolean;
  isTvbh: boolean;
  sourceCatalog: SourceCatalog;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  // Điều hướng: đổi query → đẩy URL (server render lại theo bộ lọc/trang mới). Giữ scroll.
  const pushQuery = (next: LeadsQuery) => {
    const qs = queryToSearchParams(next).toString();
    router.push(qs ? `/leads?${qs}` : '/leads', { scroll: false });
  };

  // Realtime: có lead mới/đổi → tự lấy lại dữ liệu (bỏ F5). Debounce để gộp nhiều thay đổi
  // liên tiếp thành 1 lần refresh, giữ nguyên bộ lọc (state client không mất). RLS đã gác:
  // chỉ nhận thay đổi của lead trong phạm vi user. router.refresh() lấy đúng dữ liệu enriched.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 600);
    };
    const channel = supabase
      .channel('leads-realtime')
      .on('postgres_changes', { event: '*', schema: 'crm_thacoauto', table: 'leads' }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  // KPI cards đọc thẳng từ stats server (tính trên TOÀN bộ tập khớp bộ lọc, không chỉ 1 trang).
  const cards = useMemo<StatCard[]>(() => {
    const list: StatCard[] = [
      { label: 'Tổng lead', value: stats.total, accent: true },
      { label: 'Chưa liên hệ', value: stats.pending },
      { label: 'Đã liên hệ', value: stats.contacted },
      { label: 'Tỷ lệ liên hệ', value: `${stats.rate}%` },
      { label: 'GDTD', value: stats.gdtd },
    ];
    if (b10Enabled) list.push({ label: 'Đã lên B10', value: stats.b10 });
    return list;
  }, [stats, b10Enabled]);

  useEffect(() => {
    const scroller = rootRef.current?.querySelector<HTMLElement>('[data-table-scroll]');
    const cardsEl = cardsRef.current;
    if (!scroller || !cardsEl) return;

    // Chiều cao thật của hàng card (đo trước khi set maxHeight) — dùng làm mốc thu gọn
    // để không kẹp/cụt nội dung dù 1 hay 2 hàng card.
    const baseH = cardsEl.scrollHeight;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const p = Math.min(scroller.scrollTop / THRESHOLD, 1); // 0 = hiện đủ, 1 = ẩn hết
      cardsEl.style.opacity = String(1 - p);
      cardsEl.style.maxHeight = `${(1 - p) * baseH}px`;
      cardsEl.style.marginBottom = `${(1 - p) * 20}px`;
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
    <div ref={rootRef} className="h-full flex flex-col p-3 sm:p-6 pb-1 sm:pb-2">
      <div
        ref={cardsRef}
        className={`shrink-0 grid grid-cols-3 ${cards.length >= 6 ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-2 overflow-hidden`}
        style={{ transition: 'opacity 0.15s, transform 0.15s', willChange: 'opacity, transform, max-height' }}
      >
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400 truncate">{c.label}</div>
            <div
              className="text-lg font-semibold mt-0.5 tabular-nums"
              style={{ color: c.accent ? 'var(--color-brand)' : '#0f172a' }}
            >
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <LeadsTable
          leads={leads}
          query={query}
          pushQuery={pushQuery}
          models={models}
          brands={brands}
          showrooms={showrooms}
          assignees={assignees}
          teams={teams}
          formBrands={formBrands}
          formShowrooms={formShowrooms}
          formTeams={formTeams}
          fixedTeamId={fixedTeamId}
          canCreate={canCreate}
          canAssign={canAssign}
          canDelete={canDelete}
          b10Enabled={b10Enabled}
          isTvbh={isTvbh}
          sourceCatalog={sourceCatalog}
        />
      </div>
      <LeadsPagination
        page={page}
        total={total}
        pageSize={pageSize}
        onGo={(p) => pushQuery({ ...query, page: p })}
        onSize={(s) => pushQuery({ ...query, size: s, page: 1 })}
      />
    </div>
  );
}
