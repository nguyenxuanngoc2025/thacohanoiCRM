'use client';

import React from 'react';
import { ScrollText, FileText, RefreshCw, Phone, Cpu } from 'lucide-react';
import type { LeadLogRow } from './types';
import type { StaffRow } from './AccountsManager';
import { PanelHeader, Panel } from './ui';

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  note: { label: 'Ghi chú', icon: FileText, color: '#475569' },
  status_change: { label: 'Đổi trạng thái', icon: RefreshCw, color: '#b45309' },
  contact: { label: 'Liên hệ', icon: Phone, color: '#047857' },
  system: { label: 'Hệ thống', icon: Cpu, color: 'var(--color-brand)' },
};

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ActivityLog({ logs, staff }: { logs: LeadLogRow[]; staff: StaffRow[] }) {
  const userName = (id: string | null) => id ? (staff.find((s) => s.id === id)?.full_name ?? 'Người dùng') : 'Hệ thống';

  return (
    <Panel>
      <PanelHeader
        title="Nhật ký hoạt động"
        desc="50 thao tác gần nhất trên các lead: ghi chú, đổi trạng thái, liên hệ và sự kiện hệ thống. Phục vụ truy vết."
      />
      <div className="space-y-1">
        {logs.map((l) => {
          const meta = TYPE_META[l.type] ?? TYPE_META.note;
          const Icon = meta.icon;
          return (
            <div key={l.id} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${meta.color}14` }}>
                <Icon size={13} style={{ color: meta.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-700">
                  <span className="font-medium text-slate-900">{userName(l.user_id)}</span>{' '}
                  <span className="text-slate-500">· {meta.label}</span>
                  {l.type === 'status_change' && l.old_status && l.new_status && (
                    <span className="text-slate-500"> : {l.old_status} → <span className="font-medium text-slate-700">{l.new_status}</span></span>
                  )}
                </div>
                {l.content && <div className="text-xs text-slate-500 mt-0.5 truncate">{l.content}</div>}
              </div>
              <span className="text-[11px] text-slate-400 shrink-0 whitespace-nowrap">{timeAgo(l.created_at)}</span>
            </div>
          );
        })}
        {logs.length === 0 && (
          <div className="py-10 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
            <ScrollText size={24} className="text-slate-300" />
            Chưa có hoạt động nào được ghi nhận.
          </div>
        )}
      </div>
    </Panel>
  );
}
