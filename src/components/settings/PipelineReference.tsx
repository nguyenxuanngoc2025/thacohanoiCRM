'use client';

import React from 'react';
import { ListChecks, ArrowRight } from 'lucide-react';
import { PanelHeader, Panel } from './ui';

// Trạng thái lead cố định theo CHECK DB (không sửa được ở UI — tránh lệch ràng buộc).
// Trang này là tham chiếu quy trình + số liệu thật.
const STATUSES: { code: string; label: string; desc: string; color: string; bg: string }[] = [
  { code: 'KHQT', label: 'Khách quan tâm', desc: 'Lead mới — khách bày tỏ quan tâm, chờ liên hệ.', color: '#1d4ed8', bg: '#eff6ff' },
  { code: 'GDTD', label: 'Giao dịch theo dõi', desc: 'Đang theo dõi giao dịch sau khi đã liên hệ.', color: '#b45309', bg: '#fffbeb' },
  { code: 'KHĐ', label: 'Ký hợp đồng', desc: 'Khách đã ký hợp đồng.', color: '#047857', bg: '#ecfdf5' },
  { code: 'Chưa LH được', label: 'Chưa liên hệ được', desc: 'Gọi/nhắn nhưng chưa kết nối được với khách.', color: '#475569', bg: '#f8fafc' },
  { code: 'Fail', label: 'Loại', desc: 'Khách từ chối / không có nhu cầu — kết thúc.', color: '#be123c', bg: '#fff1f2' },
];

export default function PipelineReference({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Trạng thái lead"
          desc="Quy trình lead chạy qua các trạng thái cố định, lặp tối đa 3 vòng đánh giá. Trạng thái được khoá theo ràng buộc hệ thống để đảm bảo nhất quán báo cáo."
        />
        <div className="flex flex-wrap items-stretch gap-2">
          {STATUSES.map((s, i) => (
            <React.Fragment key={s.code}>
              <div className="flex-1 min-w-[160px] rounded-lg border p-3.5" style={{ borderColor: `${s.color}33`, background: s.bg }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: s.color }}>{s.code}</span>
                  <span className="text-lg font-bold" style={{ color: s.color }}>{counts[s.code] ?? 0}</span>
                </div>
                <div className="text-sm font-semibold text-slate-800 mt-1">{s.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{s.desc}</div>
              </div>
              {i < 2 && <div className="flex items-center text-slate-300"><ArrowRight size={16} /></div>}
            </React.Fragment>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
          <ListChecks size={14} style={{ color: '#004B9B' }} />
          Tổng {total} lead trong công ty · 3 vòng đánh giá (vòng 1 = lead mới, sang vòng sau khi cần chăm sóc lại).
        </div>
      </Panel>
    </div>
  );
}
