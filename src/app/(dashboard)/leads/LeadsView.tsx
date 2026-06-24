'use client';

import React, { useEffect, useRef } from 'react';
import LeadsTable, { type LeadRow } from './LeadsTable';

export interface StatCard {
  label: string;
  value: string | number;
  color: string;
  bg: string;
}

// Tìm vùng cuộn cha gần nhất (overflowY auto/scroll). Trong app shell, đó là <main>.
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

const THRESHOLD = 140; // px cuộn để thu hết card

export default function LeadsView({ cards, leads }: { cards: StatCard[]; leads: LeadRow[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = findScrollParent(rootRef.current);
    const cardsEl = cardsRef.current;
    if (!cardsEl) return;

    let raf = 0;
    const apply = () => {
      raf = 0;
      const top = scroller ? scroller.scrollTop : window.scrollY;
      const p = Math.min(top / THRESHOLD, 1); // 0 = hiện đủ, 1 = ẩn hết
      cardsEl.style.opacity = String(1 - p);
      cardsEl.style.maxHeight = `${(1 - p) * 200}px`;
      cardsEl.style.marginBottom = `${(1 - p) * 24}px`;
      cardsEl.style.transform = `translateY(${-p * 12}px)`;
      cardsEl.style.pointerEvents = p > 0.8 ? 'none' : 'auto';
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', onScroll, { passive: true });
    apply();
    return () => {
      target.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={rootRef} className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Lead khách hàng</h1>
        <p className="text-sm text-slate-400 mt-0.5">Theo dõi lead đã liên hệ chưa và phân loại</p>
      </div>

      <div
        ref={cardsRef}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-hidden"
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

      <LeadsTable leads={leads} />
    </div>
  );
}
