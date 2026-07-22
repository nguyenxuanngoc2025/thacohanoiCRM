'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Dãy số trang gọn: 1 … (p-1) p (p+1) … last. */
function pages(cur: number, last: number): (number | '…')[] {
  const s = new Set<number>([1, last, cur, cur - 1, cur + 1]);
  const list = [...s].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const n of list) { if (prev && n - prev > 1) out.push('…'); out.push(n); prev = n; }
  return out;
}

export default function LeadsPagination({
  page, total, pageSize, onGo,
}: { page: number; total: number; pageSize: number; onGo: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = 'h-8 min-w-8 px-2 rounded-md border border-slate-200 text-sm disabled:opacity-40';
  return (
    <div className="flex items-center justify-between gap-2 py-2 text-slate-600">
      <div className="text-xs">Hiển thị {from}–{to} / {total} khách</div>
      <div className="flex items-center gap-1">
        <button className={btn} disabled={page <= 1} onClick={() => onGo(page - 1)} aria-label="Trước"><ChevronLeft size={16} /></button>
        {pages(page, last).map((p, i) => p === '…'
          ? <span key={`e${i}`} className="px-1">…</span>
          : <button key={p} className={`${btn} ${p === page ? 'bg-slate-900 text-white border-slate-900' : ''}`} onClick={() => onGo(p)}>{p}</button>)}
        <button className={btn} disabled={page >= last} onClick={() => onGo(page + 1)} aria-label="Sau"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
