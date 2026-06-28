'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, RefreshCw } from 'lucide-react';
import { filterGroups, type ZaloGroup } from '@/lib/group-filter';
import { TextInput } from './ui';

/**
 * Chọn group Zalo từ dropdown có search (thay cho nhập ID tay).
 * Lấy danh sách từ /api/integrations/zalo-bot/groups. Lỗi/chưa kết nối → fallback nhập tay.
 */
export default function GroupPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<ZaloGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    const res = await fetch('/api/integrations/zalo-bot/groups');
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setErr(data.error ?? 'Không lấy được danh sách group.'); return; }
    const list = (data.groups ?? []) as ZaloGroup[];
    setGroups(list);
    if (list.length === 0) setErr('Chưa thấy group nào — hãy thêm tài khoản bot vào group trước.');
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = groups.find((g) => g.id === value);
  const filtered = filterGroups(groups, q);

  // Lỗi/chưa kết nối → fallback nhập tay ID.
  if (err && groups.length === 0) {
    return (
      <div className="space-y-1.5">
        <TextInput value={value} onChange={(e) => onChange(e.target.value)} placeholder="Nhập group ID thủ công" />
        <p className="text-[11px] text-amber-600">{err} <button type="button" onClick={load} className="underline">Thử lại</button></p>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-[#004B9B] transition-colors">
          <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
            {selected ? selected.name : value ? `ID: ${value}` : (loading ? 'Đang tải group…' : '— Chọn group —')}
          </span>
          <ChevronDown size={15} className="text-slate-400" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
        <button type="button" title="Làm mới danh sách group" onClick={load}
          className="w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50">
          <RefreshCw size={14} className={loading ? 'animate-spin text-slate-400' : 'text-slate-500'} />
        </button>
      </div>
      {open && (
        <div className="absolute z-[450] mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search size={14} className="text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm group…"
              className="flex-1 text-sm outline-none" />
          </div>
          <div className="overflow-y-auto">
            {filtered.map((g) => (
              <button key={g.id} type="button"
                onClick={() => { onChange(g.id); setOpen(false); setQ(''); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between"
                style={{ background: g.id === value ? '#e6f0fa' : undefined }}>
                <span className="truncate text-slate-800">{g.name}</span>
                <span className="text-[10px] text-slate-400 font-mono ml-2 shrink-0">{g.id}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-center text-xs text-slate-400">Không có group khớp.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
