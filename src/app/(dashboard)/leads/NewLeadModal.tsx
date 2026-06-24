'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, UserPlus } from 'lucide-react';
import { createLead } from './actions';
import type { ModelOption, BrandOption, ShowroomOption, AssigneeOption } from './LeadsView';

export default function NewLeadModal({
  brands, showrooms, models, assignees, onClose,
}: {
  brands: BrandOption[];
  showrooms: ShowroomOption[];
  models: ModelOption[];
  assignees: AssigneeOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [brandId, setBrandId] = useState('');
  const [showroomId, setShowroomId] = useState('');
  const [modelId, setModelId] = useState('');
  const [source, setSource] = useState('Nhập tay');
  const [assignedTo, setAssignedTo] = useState('');
  const [note, setNote] = useState('');

  const brandModels = models.filter((m) => m.brand_id === brandId);

  const submit = () => {
    setError(null);
    if (!phone.trim()) { setError('Nhập số điện thoại.'); return; }
    if (!brandId) { setError('Chọn thương hiệu.'); return; }
    start(async () => {
      const res = await createLead({
        fullName,
        phone,
        brandId,
        showroomId: showroomId || null,
        modelId: modelId || null,
        source,
        assignedTo: assignedTo || null,
        note,
      });
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setError(res.error ?? 'Tạo lead thất bại.');
      }
    });
  };

  const inputCls = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-[#004B9B] outline-none';
  const lblCls = 'text-sm text-slate-600 block mb-1';

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <h3 className="font-bold text-slate-900 inline-flex items-center gap-2">
            <UserPlus size={18} style={{ color: '#004B9B' }} /> Thêm lead thủ công
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <div>
            <label className={lblCls}>Họ tên</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" className={inputCls} />
          </div>

          <div>
            <label className={lblCls}>Số điện thoại <span className="text-rose-500">*</span></label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912 345 678" inputMode="tel" className={inputCls} />
          </div>

          <div>
            <label className={lblCls}>Thương hiệu <span className="text-rose-500">*</span></label>
            <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setModelId(''); }} className={inputCls}>
              <option value="">— Chọn thương hiệu —</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div>
            <label className={lblCls}>Showroom</label>
            <select value={showroomId} onChange={(e) => setShowroomId(e.target.value)} className={inputCls}>
              <option value="">— Chưa rõ —</option>
              {showrooms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className={lblCls}>Dòng xe quan tâm</label>
            <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!brandId} className={`${inputCls} disabled:opacity-50`}>
              <option value="">— Chưa rõ —</option>
              {brandModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div>
            <label className={lblCls}>Nguồn</label>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Nhập tay" className={inputCls} />
          </div>

          <div>
            <label className={lblCls}>Phụ trách</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputCls}>
              <option value="">— Chưa giao —</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>

          <div>
            <label className={lblCls}>Ghi chú</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              placeholder="VD: Khách hỏi giá lăn bánh Carnival…"
              className={`${inputCls} resize-none`} />
          </div>

          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100 shrink-0">
          <button onClick={onClose} disabled={pending}
            className="text-sm font-medium text-slate-600 border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50 disabled:opacity-50">
            Hủy
          </button>
          <button onClick={submit} disabled={pending}
            className="text-sm font-semibold text-white rounded-lg px-4 py-2 disabled:opacity-50"
            style={{ background: '#004B9B' }}>
            {pending ? 'Đang tạo…' : 'Tạo lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
