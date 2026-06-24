'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { X, PhoneCall, RefreshCw, Clock, Save } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/phone';
import { STATUS_OPTIONS, type LeadStatus } from '@/lib/lead-status';
import { updateLead, getLeadLogs, type LeadLogItem } from './actions';
import type { LeadRow } from './LeadsTable';
import type { ModelOption } from './LeadsView';

const fmtDate = (v: string) => new Date(v).toLocaleString('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

// YYYY-MM-DD cho input[type=date] từ ISO (theo local)
const toDateInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-700 font-medium text-right">{value}</span>
    </div>
  );
}

export default function LeadDrawer({
  lead, models, onClose,
}: { lead: LeadRow; models: ModelOption[]; onClose: () => void }) {
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [modelId, setModelId] = useState<string>(lead.model_id ?? '');
  const [note, setNote] = useState('');
  const [nextDate, setNextDate] = useState(toDateInput(lead.next_contact_at));
  const [pending, start] = useTransition();
  const [logs, setLogs] = useState<LeadLogItem[] | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const brandModels = models.filter((m) => m.brand_id === lead.brand_id);

  useEffect(() => {
    getLeadLogs(lead.id).then(setLogs);
  }, [lead.id]);

  // Đóng bằng phím Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onSave = () => {
    start(async () => {
      const res = await updateLead({
        leadId: lead.id,
        status,
        modelId: modelId || null,
        note,
        nextContactAt: nextDate ? new Date(nextDate + 'T00:00:00').toISOString() : null,
      });
      if (res?.ok) {
        setFlash('Đã lưu cập nhật.');
        setNote('');
        getLeadLogs(lead.id).then(setLogs);
        setTimeout(() => setFlash(null), 2500);
      } else {
        setFlash(res?.error ?? 'Lưu thất bại.');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-[slideIn_0.2s_ease]">
        <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-100 flex items-start justify-between">
          <div>
            <div className="text-lg font-bold text-slate-900">{lead.full_name ?? '—'}</div>
            <div className="text-sm text-slate-500 mt-0.5">{formatPhoneDisplay(lead.phone)}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 -mr-1">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {/* Thông tin (chỉ đọc) */}
          <section className="bg-slate-50 rounded-xl p-3">
            <InfoRow label="Thương hiệu" value={lead.brand_name} />
            <InfoRow label="Nguồn" value={lead.source ?? '—'} />
            <InfoRow label="Phụ trách" value={lead.assignee_name ?? '—'} />
            <InfoRow label="Tạo lúc" value={fmtDate(lead.created_at)} />
            <InfoRow label="Số lần liên hệ" value={String(lead.contact_count)} />
          </section>

          {/* Form cập nhật */}
          <section className="space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Cập nhật liên hệ</div>

            <div>
              <label className="text-sm text-slate-600 block mb-1">Phân loại</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LeadStatus)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-[#004B9B] outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.code} value={s.code}>{s.code} · {s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-600 block mb-1">Dòng xe quan tâm</label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-[#004B9B] outline-none"
              >
                <option value="">— Chưa rõ —</option>
                {brandModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-600 block mb-1">Nội dung đã liên hệ</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="VD: Đã tư vấn giá lăn bánh, khách hẹn cuối tuần ghé xem xe…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-[#004B9B] outline-none resize-none"
              />
            </div>

            <div>
              <label className="text-sm text-slate-600 block mb-1">Hẹn gọi lại</label>
              <input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-[#004B9B] outline-none"
              />
            </div>

            {flash && <div className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{flash}</div>}
          </section>

          {/* Lịch sử */}
          <section>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Lịch sử liên hệ</div>
            {logs === null ? (
              <div className="text-sm text-slate-400">Đang tải…</div>
            ) : logs.length === 0 ? (
              <div className="text-sm text-slate-400">Chưa có lịch sử.</div>
            ) : (
              <ol className="space-y-3">
                {logs.map((g) => (
                  <li key={g.id} className="flex gap-3">
                    <div className="mt-0.5 shrink-0">
                      {g.type === 'contact'
                        ? <PhoneCall size={15} className="text-[#004B9B]" />
                        : g.type === 'status_change'
                          ? <RefreshCw size={15} className="text-amber-600" />
                          : <Clock size={15} className="text-slate-400" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-slate-700">{g.content ?? '—'}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {fmtDate(g.created_at)}{g.user_name ? ` · ${g.user_name}` : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-slate-100">
          <button
            onClick={onSave}
            disabled={pending}
            className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-white rounded-lg px-4 py-2.5 disabled:opacity-50"
            style={{ background: '#004B9B' }}
          >
            <Save size={16} /> {pending ? 'Đang lưu…' : 'Lưu cập nhật'}
          </button>
        </div>
      </div>
    </div>
  );
}
