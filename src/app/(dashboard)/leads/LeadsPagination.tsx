'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZES, type PageSize } from '@/lib/leads-query';

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
  page, total, pageSize, onGo, onSize,
}: { page: number; total: number; pageSize: number; onGo: (p: number) => void; onSize: (s: PageSize) => void }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = 'h-7 min-w-7 px-1.5 rounded text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent';
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-slate-600">
      <div className="flex items-center gap-2 text-xs">
        <span>Hiển thị {from}–{to} / {total} khách</span>
        <select
          className="h-7 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-600 focus:outline-none"
          value={pageSize}
          onChange={(e) => onSize(Number(e.target.value) as PageSize)}
          aria-label="Số lead mỗi trang"
        >
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}/trang</option>)}
        </select>
      </div>
      <div className="flex items-center gap-0.5">
        <button className={btn} disabled={page <= 1} onClick={() => onGo(page - 1)} aria-label="Trước"><ChevronLeft size={15} /></button>
        {pages(page, last).map((p, i) => p === '…'
          ? <span key={`e${i}`} className="px-0.5 text-slate-400">…</span>
          : <button key={p} className={`${btn} ${p === page ? 'bg-slate-900 text-white hover:bg-slate-900 font-medium' : ''}`} onClick={() => onGo(p)}>{p}</button>)}
        <button className={btn} disabled={page >= last} onClick={() => onGo(page + 1)} aria-label="Sau"><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}
