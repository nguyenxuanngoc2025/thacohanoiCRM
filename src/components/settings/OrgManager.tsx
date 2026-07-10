'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ShowroomRow, BrandRow, ModelRow } from './types';
import { PanelHeader, Panel } from './ui';

export default function OrgManager({
  showrooms, brands, models,
}: { showrooms: ShowroomRow[]; brands: BrandRow[]; models: ModelRow[] }) {
  // Thương hiệu nào đang mở (xổ danh sách dòng xe) — phần này CHỈ XEM
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  // Tên các thương hiệu của 1 showroom (ghi rõ, không gộp "Đa thương hiệu")
  const brandNamesOf = (ids: string[]) =>
    ids.map((id) => brands.find((b) => b.id === id)?.name).filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      {/* Showroom (địa điểm) — CHỈ XEM. Tạo/sửa/xoá do Chủ nền tảng quản lý ở trang Quản trị nền tảng. */}
      <Panel>
        <PanelHeader
          title="Showroom (địa điểm)"
          desc="Mỗi showroom là một địa điểm (Giải Phóng, Chương Mỹ…) và có thể bán nhiều thương hiệu. Danh sách do Chủ nền tảng quản lý. Cần thêm/sửa/xoá showroom? Phản hồi cho Chủ nền tảng để cập nhật."
        />
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Tên showroom</th>
                <th className="px-4 py-2.5 font-semibold">Mã</th>
                <th className="px-4 py-2.5 font-semibold">Thương hiệu</th>
              </tr>
            </thead>
            <tbody>
              {showrooms.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{s.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{s.code ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {brandNamesOf(s.brand_ids).length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {brandNamesOf(s.brand_ids).map((n) => (
                          <span key={n} className="inline-block text-xs font-medium rounded-md px-2 py-0.5"
                            style={{ background: '#e6f0fa', color: '#004B9B' }}>{n}</span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {showrooms.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">Chưa có showroom.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Thương hiệu & dòng xe — CHỈ XEM (danh mục dùng chung, do Chủ nền tảng quản lý ở trang Quản trị nền tảng) */}
      <Panel>
        <PanelHeader
          title="Thương hiệu & dòng xe"
          desc="Danh mục dùng chung toàn hệ thống, do Chủ nền tảng quản lý. Nhấn tên thương hiệu để xem danh sách dòng xe. Cần thêm/sửa dòng xe? Phản hồi cho Chủ nền tảng để cập nhật."
        />
        <div className="space-y-2">
          {brands.map((b) => {
            const list = models.filter((m) => m.brand_id === b.id).sort((x, y) => x.sort_order - y.sort_order);
            const isOpen = expanded.has(b.id);
            return (
              <div key={b.id} className="border border-slate-200 rounded-lg overflow-hidden">
                {/* Hàng thương hiệu */}
                <div
                  className="flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-50 cursor-pointer select-none"
                  onClick={() => toggle(b.id)}
                >
                  {isOpen
                    ? <ChevronDown size={16} className="text-slate-400 shrink-0" />
                    : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                  <span className="font-semibold text-slate-800">{b.name}</span>
                  <span className="text-xs text-slate-400">{list.length} dòng xe</span>
                </div>

                {/* Danh sách dòng xe (chỉ xem) */}
                {isOpen && (
                  <div className="divide-y divide-slate-100">
                    {list.length === 0 ? (
                      <div className="px-3.5 py-3 pl-10 text-sm text-slate-400">Chưa có dòng xe.</div>
                    ) : list.map((m) => (
                      <div key={m.id} className="flex items-center gap-2.5 px-3.5 py-2 pl-10"
                        style={{ opacity: m.is_active ? 1 : 0.5 }}>
                        <span className="text-sm font-medium text-slate-700">{m.name}</span>
                        {!m.is_active && <span className="text-[10px] text-slate-400">(ẩn)</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {brands.length === 0 && <p className="text-sm text-slate-400">Chưa có thương hiệu.</p>}
        </div>
      </Panel>
    </div>
  );
}
