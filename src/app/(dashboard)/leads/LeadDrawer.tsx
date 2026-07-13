'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { X, PhoneCall, RefreshCw, Clock, Save, Pencil, Check, History } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/phone';
import { sourceLabel, sourcePlatform, type SourceCatalog } from '@/lib/source';
import { STATUS_OPTIONS, FAIL_REASONS, type LeadStatus } from '@/lib/lead-status';
import { updateLead, reassignLead, reassignTeam, renameLead, getLeadLogs, type LeadLogItem } from './actions';
import type { LeadRow } from './LeadsTable';
import type { ModelOption, AssigneeOption, TeamOption } from './LeadsView';
import ModalPortal from '@/components/ui/ModalPortal';

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
  lead, models, assignees, teams, canManage, b10Enabled, sourceCatalog, onClose,
}: {
  lead: LeadRow;
  models: ModelOption[];
  assignees: AssigneeOption[];
  teams: TeamOption[];
  canManage: boolean;
  b10Enabled: boolean;
  sourceCatalog: SourceCatalog;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<LeadStatus | ''>(lead.status ?? '');
  // Lý do loại: nếu lead đang Fail, tách sẵn ra ô chọn (preset) hoặc ô nhập tay (khi lý do cũ không thuộc preset).
  const initReason = lead.status === 'Fail' ? (lead.fail_reason ?? '') : '';
  const initIsPreset = (FAIL_REASONS as readonly string[]).includes(initReason);
  const [reasonSel, setReasonSel] = useState<string>(initReason ? (initIsPreset ? initReason : 'Khác') : '');
  const [customReason, setCustomReason] = useState<string>(initReason && !initIsPreset ? initReason : '');
  const [fullName, setFullName] = useState(lead.full_name ?? '');
  const [editingName, setEditingName] = useState(false);
  const [modelId, setModelId] = useState<string>(lead.model_id ?? '');
  const [note, setNote] = useState('');
  const [nextDate, setNextDate] = useState(toDateInput(lead.next_contact_at));
  const [assignedTo, setAssignedTo] = useState<string>(lead.assigned_to ?? '');
  const [salesTeamId, setSalesTeamId] = useState<string>(lead.sales_team_id ?? '');
  const [pending, start] = useTransition();
  const [logs, setLogs] = useState<LeadLogItem[] | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const brandModels = models.filter((m) => m.brand_id === lead.brand_id);
  // Phòng bán hàng của ĐÚNG showroom + có bán thương hiệu của lead (phòng gắn TẬP brand_ids).
  const showroomTeams = teams.filter(
    (t) => t.showroom_id === lead.showroom_id && t.brand_ids.includes(lead.brand_id)
  );
  // Phụ trách: lọc TVBH theo phòng đã chọn (nếu có) để chỉ giao trong đúng phòng; chưa phân phòng → liệt kê tất cả.
  const teamAssignees = salesTeamId
    ? assignees.filter((a) => a.sales_team_id === salesTeamId)
    : assignees;

  const cancelName = () => { setFullName(lead.full_name ?? ''); setEditingName(false); };
  const onRename = () => {
    start(async () => {
      const res = await renameLead(lead.id, fullName.trim() || null);
      if (res.ok) {
        setEditingName(false);
        setFlash('Đã lưu tên khách hàng.');
        getLeadLogs(lead.id).then(setLogs);
        setTimeout(() => setFlash(null), 2500);
      } else {
        setFlash(res.error ?? 'Lưu tên thất bại.');
      }
    });
  };

  const onReassign = (next: string) => {
    const prev = assignedTo;
    setAssignedTo(next);
    start(async () => {
      const res = await reassignLead(lead.id, next || null);
      if (res.ok) {
        setFlash('Đã đổi người phụ trách.');
        getLeadLogs(lead.id).then(setLogs);
        setTimeout(() => setFlash(null), 2500);
      } else {
        setAssignedTo(prev);
        setFlash(res.error ?? 'Đổi phụ trách thất bại.');
      }
    });
  };

  const onReassignTeam = (next: string) => {
    const prev = salesTeamId;
    setSalesTeamId(next);
    start(async () => {
      const res = await reassignTeam(lead.id, next || null);
      if (res.ok) {
        // Đổi phòng có thể gỡ phụ trách (TP phòng mới tự phân lại) → đồng bộ UI.
        if (res.clearedAssignee) setAssignedTo('');
        setFlash(res.clearedAssignee
          ? 'Đã chuyển phòng — gỡ phụ trách để trưởng phòng phân lại.'
          : 'Đã chuyển phòng bán hàng.');
        getLeadLogs(lead.id).then(setLogs);
        setTimeout(() => setFlash(null), 2500);
      } else {
        setSalesTeamId(prev);
        setFlash(res.error ?? 'Chuyển phòng thất bại.');
      }
    });
  };

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
        status: status || null,
        failReason: reasonSel === 'Khác' ? customReason : reasonSel,
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
    <ModalPortal>
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 1000 }}>
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[92dvh] bg-white rounded-2xl shadow-2xl flex flex-col animate-[popIn_0.18s_ease]">
        <style>{`@keyframes popIn{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:scale(1)}}`}</style>

        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-100 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onRename(); if (e.key === 'Escape') cancelName(); }}
                  placeholder="Nhập tên khách hàng"
                  className="text-lg font-bold text-slate-900 border-b border-brand outline-none w-full bg-transparent"
                />
                <button onClick={onRename} disabled={pending} className="text-brand p-1 shrink-0 disabled:opacity-50" title="Lưu tên">
                  <Check size={18} />
                </button>
                <button onClick={cancelName} className="text-slate-400 hover:text-slate-600 p-1 shrink-0" title="Huỷ">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-slate-900 truncate">{fullName.trim() || '—'}</span>
                <button onClick={() => setEditingName(true)} className="text-slate-300 hover:text-brand p-1 shrink-0" title="Sửa tên">
                  <Pencil size={14} />
                </button>
              </div>
            )}
            <div className="text-sm text-slate-500 mt-0.5">{formatPhoneDisplay(lead.phone)}</div>
            {b10Enabled && lead.b10_status && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-xs font-medium">
                <History size={12} /> KH cũ · B10: {lead.b10_status}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 -mr-1 shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-5 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-5">
          {/* Cột trái: thông tin + B10 (chỉ đọc). Mobile: contents → các section thành flex-item để đổi thứ tự. */}
          <div className="contents md:block md:space-y-5">
          {/* Thông tin (chỉ đọc) */}
          <section className="bg-slate-50 rounded-xl p-3">
            <InfoRow label="Showroom" value={lead.showroom_name ?? '—'} />
            <InfoRow label="Thương hiệu" value={lead.brand_name} />
            <InfoRow label="Nguồn" value={sourcePlatform(lead.source, sourceCatalog)} />
            <InfoRow label="Chi tiết kênh" value={sourceLabel(lead.source, sourceCatalog)} />
            {canManage ? (
              <div className="flex justify-between items-center gap-3 py-1.5 text-sm">
                <span className="text-slate-400">Phòng bán hàng</span>
                <select
                  value={salesTeamId}
                  disabled={pending || showroomTeams.length === 0}
                  onChange={(e) => onReassignTeam(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white focus:border-brand outline-none disabled:opacity-50 max-w-[60%]"
                >
                  <option value="">— Chưa phân phòng —</option>
                  {showroomTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            ) : (
              <InfoRow label="Phòng bán hàng" value={lead.team_name ?? '—'} />
            )}
            {canManage ? (
              <div className="flex justify-between items-center gap-3 py-1.5 text-sm">
                <span className="text-slate-400">Phụ trách</span>
                <select
                  value={assignedTo}
                  disabled={pending}
                  onChange={(e) => onReassign(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white focus:border-brand outline-none disabled:opacity-50 max-w-[60%]"
                >
                  <option value="">— Chưa giao —</option>
                  {teamAssignees.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              </div>
            ) : (
              <InfoRow label="Phụ trách" value={lead.assignee_name ?? '—'} />
            )}
            <InfoRow label="Tạo lúc" value={fmtDate(lead.created_at)} />
            <InfoRow label="Số lần liên hệ" value={String(lead.contact_count)} />
            {lead.no_answer_count > 0 && <InfoRow label="Số lần gọi hụt" value={String(lead.no_answer_count)} />}
            {lead.status === 'Fail' && lead.fail_reason && <InfoRow label="Lý do loại" value={lead.fail_reason} />}
          </section>

          {/* Đối soát B10 (chỉ xem) — luôn hiện khi công ty bật B10, kể cả chưa đối soát. Mobile: đẩy xuống cuối. */}
          {b10Enabled && (
            <section className="order-last md:order-none rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Đối soát B10 (DDMS)</div>
              <div className="flex justify-between items-center gap-3 py-1.5 text-sm">
                <span className="text-slate-400">Đã lên B10</span>
                {lead.b10_on ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                    <Check size={16} /> Đã lên
                  </span>
                ) : (
                  <span className="text-slate-400">Chưa đối soát</span>
                )}
              </div>
              <InfoRow label="Trạng thái B10" value={lead.b10_status ?? 'Chưa có trên B10'} />
              <div className="py-1.5 text-sm">
                <div className="text-slate-400 mb-1">Nội dung chăm sóc</div>
                <div className="text-slate-700 whitespace-pre-wrap">{lead.b10_care_note || '—'}</div>
              </div>
            </section>
          )}
          </div>

          {/* Cột phải: cập nhật liên hệ + lịch sử. Mobile: contents → gộp vào cùng cột dọc. */}
          <div className="contents md:block md:space-y-5">
          {/* Form cập nhật */}
          <section className="space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Cập nhật liên hệ</div>

            <div>
              <label className="text-sm text-slate-600 block mb-1">Phân loại</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LeadStatus | '')}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-brand outline-none"
              >
                <option value="">— Chưa phân loại —</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.code} value={s.code}>{s.code} · {s.label}</option>
                ))}
              </select>
            </div>

            {status === 'Fail' && (
              <div>
                <label className="text-sm text-slate-600 block mb-1">Lý do loại</label>
                <select
                  value={reasonSel}
                  onChange={(e) => setReasonSel(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-brand outline-none"
                >
                  <option value="">— Chọn lý do —</option>
                  {FAIL_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {reasonSel === 'Khác' && (
                  <input
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Nhập lý do khác…"
                    className="mt-2 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-brand outline-none"
                  />
                )}
              </div>
            )}

            <div>
              <label className="text-sm text-slate-600 block mb-1">Dòng xe quan tâm</label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-brand outline-none"
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
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-brand outline-none resize-none"
              />
            </div>

            <div>
              <label className="text-sm text-slate-600 block mb-1">Hẹn gọi lại</label>
              <input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-brand outline-none"
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
                        ? <PhoneCall size={15} className="text-brand" />
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
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3 border-t border-slate-100">
          <button
            onClick={onSave}
            disabled={pending}
            className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-white rounded-lg px-4 py-2.5 disabled:opacity-50"
            style={{ background: 'var(--color-brand)' }}
          >
            <Save size={16} /> {pending ? 'Đang lưu…' : 'Lưu cập nhật'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
