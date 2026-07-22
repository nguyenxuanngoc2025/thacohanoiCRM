'use client';

import React, { useState, useMemo, useTransition, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  PhoneCall, Check, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft,
  SlidersHorizontal, UserPlus, Search, Download, AlertTriangle, ListFilter, Trash2,
  GripVertical, Pin, History,
} from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/phone';
import { STATUS_OPTIONS, FAIL_REASONS, isContacted, type LeadStatus } from '@/lib/lead-status';
import { sourceLabel, sourcePlatform, type SourceCatalog } from '@/lib/source';
import { classifyLead, markContacted, unmarkContacted, bulkReassign, deleteLeads, setLeadModel } from './actions';
import { isLeadOverdue } from '@/lib/overdue';
import { type LeadsQuery, type LeadSortKey } from '@/lib/leads-query';
import type { ModelOption, BrandOption, ShowroomOption, AssigneeOption, TeamOption } from './LeadsView';
import { exportLeads } from './export-action';
import LeadDrawer from './LeadDrawer';
import NewLeadModal from './NewLeadModal';
import TimeRangeFilter from './TimeRangeFilter';

export interface LeadRow {
  id: string;
  full_name: string | null;
  phone: string;
  source: string | null;
  status: LeadStatus | null;
  created_at: string;
  last_contact_at: string | null;
  next_contact_at: string | null;
  last_note: string | null;
  brand_id: string;
  brand_name: string;
  model_id: string | null;
  model_name: string | null;
  showroom_id: string | null;
  showroom_name: string | null;
  sales_team_id: string | null;
  team_name: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  contact_count: number;
  fail_reason: string | null;
  no_answer_count: number;
  b10_status: LeadStatus | null;
  b10_on: boolean;
  b10_care_note: string | null;
}

/** Lead quá hạn: đã giao TVBH, chưa chuyển trạng thái, hạn SLA đã trôi qua. */
export function isOverdue(l: LeadRow): boolean {
  return isLeadOverdue(l, Date.now());
}

type Tab = 'all' | 'pending' | 'contacted' | 'overdue';
type ColKey =
  | 'time' | 'name' | 'phone' | 'showroom' | 'team' | 'brand' | 'model' | 'platform' | 'assignee'
  | 'contacted' | 'class' | 'failreason' | 'contactedAt' | 'note' | 'source' | 'next' | 'count'
  | 'b10on' | 'b10class' | 'b10note';

// Cột nào có thể sắp xếp phía server (khớp LeadSortKey của RPC). Cột khác chỉ hiển thị.
const SORTABLE: Partial<Record<ColKey, LeadSortKey>> = {
  time: 'time', name: 'name', phone: 'phone', showroom: 'showroom', team: 'team',
  brand: 'brand', model: 'model', assignee: 'assignee', class: 'class',
};

interface ColDef { key: ColKey; label: string; pad: string }

const COLS: ColDef[] = [
  { key: 'time', label: 'Thời gian', pad: 'px-4' },
  { key: 'name', label: 'Khách hàng', pad: 'px-5' },
  { key: 'phone', label: 'SĐT', pad: 'px-4' },
  { key: 'contacted', label: 'Trạng thái', pad: 'px-4' },
  { key: 'class', label: 'Phân loại', pad: 'px-4' },
  { key: 'failreason', label: 'Lý do loại', pad: 'px-4' },
  { key: 'b10on', label: 'B10', pad: 'px-4' },
  { key: 'b10class', label: 'Trạng thái B10', pad: 'px-4' },
  { key: 'b10note', label: 'Nội dung chăm sóc B10', pad: 'px-4' },
  { key: 'platform', label: 'Nguồn', pad: 'px-4' },
  { key: 'brand', label: 'Thương hiệu', pad: 'px-4' },
  { key: 'showroom', label: 'Showroom', pad: 'px-4' },
  { key: 'team', label: 'Phòng bán hàng', pad: 'px-4' },
  { key: 'assignee', label: 'Phụ trách', pad: 'px-4' },
  { key: 'source', label: 'Chi tiết kênh', pad: 'px-4' },
  { key: 'model', label: 'Dòng xe', pad: 'px-4' },
  { key: 'contactedAt', label: 'Liên hệ lúc', pad: 'px-4' },
  { key: 'note', label: 'Nội dung liên hệ', pad: 'px-4' },
  { key: 'next', label: 'Hẹn gọi lại', pad: 'px-4' },
  { key: 'count', label: 'Số lần LH', pad: 'px-4' },
];

// Cột thông tin KH được đóng băng khi cuộn ngang (theo thứ tự, có width cố định)
const STICKY: ColKey[] = ['time', 'name', 'phone'];
const STICKY_W: Record<string, number> = { time: 150, name: 180, phone: 140 };
const SEL_W = 44;

const STORAGE_KEY = 'leads.cols.v5';
const DEFAULT_HIDDEN: ColKey[] = ['source', 'model', 'contactedAt', 'note', 'next', 'count'];

// TVBH (nhân viên bán hàng) chỉ chăm lead của chính mình → ẩn các cột tổ chức trùng lặp
// (Showroom/Phòng/Phụ trách đều là của chính họ) và chi tiết phụ; ưu tiên cột tác nghiệp:
// Dòng xe, Nội dung liên hệ, Hẹn gọi lại, Số lần LH. Vẫn tick mở lại nếu cần.
const TVBH_STORAGE_KEY = 'leads.cols.tvbh.v1';
const TVBH_DEFAULT_HIDDEN: ColKey[] = ['showroom', 'team', 'assignee', 'source', 'contactedAt', 'b10on', 'b10class', 'b10note'];

// Thứ tự cột do người dùng kéo-thả (chỉ áp dụng cho cột KHÔNG đóng băng; cột sticky luôn ghim đầu).
const ORDER_KEY = 'leads.colorder.v1';
const DEFAULT_ORDER: ColKey[] = COLS.filter((c) => !STICKY.includes(c.key)).map((c) => c.key);

const fmtDate = (v: string) => new Date(v).toLocaleString('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const fmtDay = (v: string) => new Date(v).toLocaleDateString('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

interface Opt { value: string; label: string }

// Dropdown filter tuỳ biến (button + popup fixed mở xuống) — tránh native select mở ngược lên
function Filter({ value, onChange, placeholder, options }: {
  value: string; onChange: (v: string) => void; placeholder: string; options: Opt[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const active = value !== '';
  const current = options.find((o) => o.value === value);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const width = Math.max(r.width, 180);
      const below = window.innerHeight - r.bottom;
      // Gần đáy màn hình → lật lên trên để danh sách không bị tràn/khuất.
      if (below < 280 && r.top > below) setPos({ bottom: window.innerHeight - r.top + 4, left: r.left, width });
      else setPos({ top: r.bottom + 4, left: r.left, width });
    }
    setOpen(true);
  };

  const pick = (v: string) => { onChange(v); setOpen(false); };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="inline-flex w-full items-center justify-between gap-1.5 text-sm border rounded-lg px-2.5 py-1.5 outline-none transition-colors"
        style={{
          borderColor: active ? 'var(--color-brand)' : '#e2e8f0',
          background: active ? '#e6f0fa' : '#fff',
          color: active ? 'var(--color-brand)' : '#64748b',
          fontWeight: active ? 600 : 400,
        }}
      >
        <span className="truncate">{active ? (current?.label ?? value) : placeholder}</span>
        <ChevronDown size={13} className="opacity-60 shrink-0" />
      </button>
      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: pos.width, zIndex: 9999,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, maxHeight: 280, overflowY: 'auto',
            }}
          >
            <button
              onClick={() => pick('')}
              className="block w-full text-left text-sm rounded-md px-2.5 py-1.5 hover:bg-slate-50"
              style={{ color: !active ? 'var(--color-brand)' : '#475569', fontWeight: !active ? 600 : 400 }}
            >
              {placeholder}
            </button>
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => pick(o.value)}
                className="block w-full text-left text-sm rounded-md px-2.5 py-1.5 hover:bg-slate-50"
                style={{ color: value === o.value ? 'var(--color-brand)' : '#475569', fontWeight: value === o.value ? 600 : 400 }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// Sửa nhanh dòng xe ngay trong bảng — popup chọn dòng xe (lọc theo thương hiệu của lead).
// Click pill → mở danh sách dòng xe cùng thương hiệu; chọn = cập nhật ngay (server action),
// kèm tuỳ chọn "Bỏ dòng xe". KHÔNG mở LeadDrawer, KHÔNG đụng trạng thái/liên hệ.
function ModelPicker({ lead, models, pending, start }: {
  lead: LeadRow;
  models: ModelOption[];
  pending: boolean;
  start: (cb: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);

  const brandModels = models.filter((m) => m.brand_id === lead.brand_id);
  const close = () => setOpen(false);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) { close(); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const below = window.innerHeight - r.bottom;
      if (below < 300 && r.top > below) setPos({ left: r.left, bottom: window.innerHeight - r.top + 4 });
      else setPos({ left: r.left, top: r.bottom + 4 });
    }
    setOpen(true);
  };

  const pick = (modelId: string | null) => {
    close();
    if ((lead.model_id ?? null) === modelId) return;
    start(() => { void setLeadModel(lead.id, modelId); });
  };

  return (
    <>
      <button
        ref={btnRef} disabled={pending} onClick={toggle}
        title="Bấm để đổi dòng xe"
        className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 disabled:opacity-50 ${
          lead.model_name
            ? 'font-medium text-slate-700 bg-slate-100 hover:bg-slate-200'
            : 'text-slate-400 border border-dashed border-slate-300 hover:border-slate-400 hover:text-slate-500'
        }`}
      >
        {lead.model_name ?? 'Chọn dòng xe'} <ChevronDown size={11} className="opacity-60" />
      </button>
      {open && pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={(e) => { e.stopPropagation(); close(); }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: 200, zIndex: 9999,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6,
              maxHeight: '70vh', overflowY: 'auto',
            }}
          >
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-2 py-1">{lead.brand_name}</div>
            {brandModels.length === 0 ? (
              <div className="text-sm text-slate-400 px-2 py-1.5">Thương hiệu chưa có dòng xe.</div>
            ) : (
              brandModels.map((m) => (
                <button key={m.id} onClick={() => pick(m.id)}
                  className={`flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 ${
                    lead.model_id === m.id ? 'text-brand font-medium' : 'text-slate-700'
                  }`}>
                  {lead.model_id === m.id && <Check size={13} />}
                  <span className={lead.model_id === m.id ? '' : 'pl-[21px]'}>{m.name}</span>
                </button>
              ))
            )}
            {lead.model_id && (
              <button onClick={() => pick(null)}
                className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 text-rose-600 border-t border-slate-100 mt-1 pt-1.5">
                <span className="pl-[21px]">Bỏ dòng xe</span>
              </button>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

// Chọn phân loại / đổi trạng thái liên hệ — popup tuỳ biến (đẹp + đồng bộ với Filter).
// Cột Phân loại: luôn mở picker phân loại (chọn 1 phân loại = vừa đánh dấu đã liên hệ
// vừa set status). Cột Trạng thái: lần đầu (chưa liên hệ) mở picker phân loại; khi đã
// liên hệ thì click mở popup ĐỔI LẠI trạng thái (đã/chưa liên hệ).
// Quy tắc: đã liên hệ BẮT BUỘC có phân loại (không có "bỏ phân loại"); Fail kèm lý do;
// "Chưa LH được" hiển thị số lần đã gọi hụt.
function StatusPicker({ lead, variant, pending, start }: {
  lead: LeadRow;
  variant: 'contacted' | 'class';
  pending: boolean;
  start: (cb: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const [failStep, setFailStep] = useState(false);
  const [khac, setKhac] = useState<string | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const contacted = isContacted(lead.last_contact_at);
  const status = lead.status;
  const opt = status ? STATUS_OPTIONS.find((s) => s.code === status) : null;

  // Cột Trạng thái + đã liên hệ → popup đổi trạng thái; còn lại → picker phân loại.
  const mode: 'classify' | 'toggle' = variant === 'contacted' && contacted ? 'toggle' : 'classify';

  const close = () => { setOpen(false); setFailStep(false); setKhac(null); };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) { close(); return; }
    setFailStep(false); setKhac(null);
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const below = window.innerHeight - r.bottom;
      // Kẹp mép trái để popup (rộng ~220) không tràn ra ngoài màn hình (mobile: nút sát mép phải).
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 228));
      // Gần đáy màn hình → lật lên trên để không bị footer/scrollbar che.
      if (below < 300 && r.top > below) setPos({ left, bottom: window.innerHeight - r.top + 4 });
      else setPos({ left, top: r.bottom + 4 });
    }
    setOpen(true);
  };

  const pickStatus = (code: LeadStatus) => {
    if (code === 'Fail') { setFailStep(true); return; } // Fail → bước chọn lý do
    close();
    start(() => classifyLead(lead.id, code));
  };
  const pickReason = (reason: string) => { close(); start(() => classifyLead(lead.id, 'Fail', reason)); };
  const confirmKhac = () => { const v = (khac ?? '').trim() || 'Khác'; close(); start(() => classifyLead(lead.id, 'Fail', v)); };
  const markOnly = () => { close(); start(() => markContacted(lead.id)); };
  const unmark = () => { close(); start(() => unmarkContacted(lead.id)); };

  // Nhãn pill: "Chưa LH được" kèm số lần gọi hụt; tiêu đề Fail hiện lý do.
  const count = lead.no_answer_count;
  const pillLabel = opt
    ? (status === 'Chưa LH được' && count > 0 ? `${opt.code} ·${count}` : opt.code)
    : '';
  const pillTitle = status === 'Fail' && lead.fail_reason ? `Lý do loại: ${lead.fail_reason}` : undefined;

  let trigger: React.ReactNode;
  if (variant === 'contacted') {
    trigger = contacted ? (
      <button ref={btnRef} disabled={pending} onClick={toggle}
        className="inline-flex items-center justify-center gap-1 min-w-[112px] text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1 hover:bg-emerald-100 disabled:opacity-50">
        <Check size={13} /> Đã liên hệ <ChevronDown size={11} className="opacity-60" />
      </button>
    ) : (
      <button ref={btnRef} disabled={pending} onClick={toggle}
        className="inline-flex items-center justify-center gap-1 min-w-[112px] text-xs font-medium text-brand border border-blue-200 rounded-full px-2.5 py-1 hover:bg-blue-50 disabled:opacity-50">
        <PhoneCall size={12} /> Chưa liên hệ
      </button>
    );
  } else if (!contacted) {
    // Chưa liên hệ → chưa được phân loại. Hiển thị dấu '—', click không có tác dụng.
    trigger = (
      <span title="Cần đánh dấu đã liên hệ trước khi phân loại" className="text-slate-300 text-sm select-none">—</span>
    );
  } else {
    trigger = opt ? (
      <button ref={btnRef} disabled={pending} onClick={toggle} title={pillTitle}
        className="inline-flex items-center justify-center gap-1 min-w-[96px] text-xs font-medium rounded-full px-2.5 py-1 disabled:opacity-50"
        style={{ color: opt.color, background: opt.bg }}>
        {pillLabel} <ChevronDown size={11} className="opacity-60" />
      </button>
    ) : (
      <button ref={btnRef} disabled={pending} onClick={toggle}
        className="inline-flex items-center justify-center gap-1 min-w-[96px] text-xs text-slate-400 border border-dashed border-slate-300 rounded-full px-2.5 py-1 hover:border-slate-400 hover:text-slate-500 disabled:opacity-50">
        Phân loại <ChevronDown size={11} className="opacity-60" />
      </button>
    );
  }

  return (
    <>
      {trigger}
      {open && pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={(e) => { e.stopPropagation(); close(); }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: 220, zIndex: 9999,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6,
              maxHeight: '70vh', overflowY: 'auto',
            }}
          >
            {mode === 'toggle' ? (
              <>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-2 py-1">Trạng thái liên hệ</div>
                <button onClick={() => close()}
                  className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 text-emerald-700">
                  <Check size={14} /> Đã liên hệ
                </button>
                <button onClick={unmark}
                  className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 text-slate-600">
                  <PhoneCall size={13} /> Chưa liên hệ
                </button>
              </>
            ) : failStep ? (
              <>
                <div className="flex items-center gap-1.5 px-1 py-1">
                  <button onClick={() => { setFailStep(false); setKhac(null); }}
                    className="text-slate-400 hover:text-slate-600 p-0.5">
                    <ChevronLeft size={15} />
                  </button>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Lý do loại</span>
                </div>
                {FAIL_REASONS.map((r) => (
                  r === 'Khác' ? (
                    khac === null ? (
                      <button key={r} onClick={() => setKhac('')}
                        className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 text-slate-600">
                        Khác (nhập tay)…
                      </button>
                    ) : (
                      <div key={r} className="px-1 py-1">
                        <input
                          autoFocus
                          value={khac}
                          onChange={(e) => setKhac(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') confirmKhac(); }}
                          placeholder="Nhập lý do…"
                          className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 outline-none focus:border-brand"
                        />
                        <button onClick={confirmKhac}
                          className="mt-1.5 w-full text-sm font-medium text-white rounded-md px-2 py-1.5"
                          style={{ background: 'var(--color-brand)' }}>
                          Lưu lý do
                        </button>
                      </div>
                    )
                  ) : (
                    <button key={r} onClick={() => pickReason(r)}
                      className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 text-slate-600">
                      {r}
                    </button>
                  )
                ))}
              </>
            ) : (
              <>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-2 py-1">Phân loại khách</div>
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.code}
                    onClick={() => pickStatus(s.code)}
                    className="flex items-center gap-2 w-full text-left rounded-md px-2 py-1.5 hover:bg-slate-50"
                    style={{ background: status === s.code ? s.bg : undefined }}
                  >
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-sm font-medium" style={{ color: s.color }}>{s.code}</span>
                    <span className="text-xs text-slate-400 truncate">{s.label}</span>
                  </button>
                ))}
                {!contacted && (
                  <>
                    <div className="h-px bg-slate-100 my-1" />
                    <button onClick={markOnly}
                      className="flex items-center gap-2 w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 text-brand">
                      <PhoneCall size={13} /> Chỉ đánh dấu đã liên hệ
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

export default function LeadsTable({
  leads, query, pushQuery, models, brands, showrooms, assignees, teams,
  formBrands, formShowrooms, formTeams, fixedTeamId,
  canCreate, canAssign, canDelete, b10Enabled, isTvbh, sourceCatalog,
}: {
  leads: LeadRow[];
  query: LeadsQuery;
  pushQuery: (q: LeadsQuery) => void;
  models: ModelOption[];
  brands: BrandOption[];
  showrooms: ShowroomOption[];
  assignees: AssigneeOption[];
  teams: TeamOption[];
  formBrands: BrandOption[];
  formShowrooms: ShowroomOption[];
  formTeams: TeamOption[];
  fixedTeamId: string | null;
  canCreate: boolean;
  canAssign: boolean;
  canDelete: boolean;
  b10Enabled: boolean;
  isTvbh: boolean;
  sourceCatalog: SourceCatalog;
}) {
  // Khoá lưu cấu hình cột + bộ cột ẩn mặc định khác nhau theo vai trò (TVBH gọn hơn).
  const storageKey = isTvbh ? TVBH_STORAGE_KEY : STORAGE_KEY;
  const defaultHidden = isTvbh ? TVBH_DEFAULT_HIDDEN : DEFAULT_HIDDEN;
  const [showNew, setShowNew] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState<Set<ColKey>>(() => new Set(defaultHidden));
  const [order, setOrder] = useState<ColKey[]>(DEFAULT_ORDER);
  const [dragKey, setDragKey] = useState<ColKey | null>(null);
  const [overKey, setOverKey] = useState<ColKey | null>(null);
  const [colMenu, setColMenu] = useState(false);
  const [openLead, setOpenLead] = useState<LeadRow | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filterMenu, setFilterMenu] = useState(false);
  // Ô tìm kiếm: gõ vào state cục bộ, debounce 300ms rồi mới đẩy URL (tránh render lại mỗi ký tự).
  const [qLocal, setQLocal] = useState(query.q);
  // Dropdown trong header render qua portal (card có overflow-hidden sẽ cắt mất nếu dùng absolute)
  const filterBtnRef = React.useRef<HTMLButtonElement>(null);
  const colBtnRef = React.useRef<HTMLButtonElement>(null);
  const [filterPos, setFilterPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const [colPos, setColPos] = useState<{ left: number; top: number } | null>(null);
  const openFilterMenu = () => {
    if (filterMenu) { setFilterMenu(false); return; }
    const r = filterBtnRef.current?.getBoundingClientRect();
    if (r) {
      const W = Math.min(460, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
      setFilterPos({ left, top: r.bottom + 4, width: W });
    }
    setFilterMenu(true);
  };
  const openColMenu = () => {
    if (colMenu) { setColMenu(false); return; }
    const r = colBtnRef.current?.getBoundingClientRect();
    if (r) setColPos({ left: r.right - 224, top: r.bottom + 4 });
    setColMenu(true);
  };

  // Khôi phục cấu hình cột hiển thị + thứ tự cột
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setHidden(new Set(JSON.parse(raw) as ColKey[]));
    } catch { /* ignore */ }
    try {
      const rawOrder = localStorage.getItem(ORDER_KEY);
      if (rawOrder) {
        // Giữ thứ tự đã lưu cho cột còn tồn tại, nối thêm cột mới (nếu sau này thêm cột) vào cuối.
        const saved = (JSON.parse(rawOrder) as ColKey[]).filter((k) => DEFAULT_ORDER.includes(k));
        const missing = DEFAULT_ORDER.filter((k) => !saved.includes(k));
        setOrder([...saved, ...missing]);
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  // Bỏ chọn khi tập lead theo bộ lọc thay đổi
  useEffect(() => { setSel(new Set()); }, [leads]);

  // Đồng bộ ô tìm kiếm khi URL đổi từ ngoài (điều hướng, xoá lọc).
  useEffect(() => { setQLocal(query.q); }, [query.q]);
  // Debounce 300ms: chỉ đẩy URL khi từ khoá thật sự khác giá trị đang áp.
  useEffect(() => {
    const t = setTimeout(() => { if (qLocal !== query.q) pushQuery({ ...query, q: qLocal, page: 1 }); }, 300);
    return () => clearTimeout(t);
  }, [qLocal]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCol = (key: ColKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  // Kéo-thả đổi thứ tự cột (chèn cột `from` vào vị trí của cột `to`).
  const moveCol = (from: ColKey, to: ColKey) => {
    if (from === to) return;
    setOrder((prev) => {
      const arr = [...prev];
      const fi = arr.indexOf(from);
      const ti = arr.indexOf(to);
      if (fi < 0 || ti < 0) return prev;
      arr.splice(fi, 1);
      arr.splice(ti, 0, from);
      try { localStorage.setItem(ORDER_KEY, JSON.stringify(arr)); } catch { /* ignore */ }
      return arr;
    });
  };

  // Đổi 1 ô lọc → đẩy URL (reset về trang 1). Đổi thương hiệu thì xoá dòng xe đang chọn.
  const setF = (k: 'showroom' | 'brand' | 'model' | 'source' | 'assignee' | 'status' | 'team', v: string) =>
    pushQuery({ ...query, [k]: v, ...(k === 'brand' ? { model: '' } : {}), page: 1 });

  // Số bộ lọc đang bật (không tính ô tìm kiếm + mốc thời gian — chúng có control riêng).
  const activeFilters = [query.showroom, query.team, query.brand, query.model, query.source, query.assignee, query.status].filter(Boolean).length;
  const clearFilters = () => pushQuery({
    ...query,
    showroom: '', team: '', brand: '', model: '', source: '', assignee: '', status: '', page: 1,
  });

  // Cột sticky luôn ghim đầu theo thứ tự cố định; cột còn lại theo thứ tự người dùng kéo-thả.
  const byKey = (k: ColKey) => COLS.find((c) => c.key === k)!;
  const orderedCols: ColDef[] = [...STICKY.map(byKey), ...order.map(byKey)];
  // Cột B10 chỉ hiện khi công ty bật tính năng đối soát.
  const allowB10 = (k: ColKey) => b10Enabled || (k !== 'b10on' && k !== 'b10class' && k !== 'b10note');
  const visibleCols = orderedCols.filter((c) => !hidden.has(c.key) && allowB10(c.key));

  // Tính offset trái cho các cột đóng băng (chỉ những cột đang hiện); chừa chỗ cột chọn.
  const leftMap: Partial<Record<ColKey, number>> = {};
  let acc = canAssign ? SEL_W : 0;
  for (const c of visibleCols) {
    if (STICKY.includes(c.key)) { leftMap[c.key] = acc; acc += STICKY_W[c.key]; }
  }
  const stickyStyle = (key: ColKey, header: boolean, over = false): React.CSSProperties => {
    if (leftMap[key] === undefined) return {};
    const isLast = STICKY.filter((k) => leftMap[k] !== undefined).slice(-1)[0] === key;
    return {
      position: 'sticky',
      left: leftMap[key],
      width: STICKY_W[key],
      minWidth: STICKY_W[key],
      zIndex: header ? 20 : 1,
      background: header ? '#f8fafc' : over ? '#fff1f2' : '#fff',
      boxShadow: isLast ? '2px 0 4px -2px rgba(0,0,0,0.08)' : undefined,
    };
  };

  // Bảng render đúng 1 trang đã lọc/sắp từ server → không lọc/sắp lại ở client.
  const rows = leads;
  const tab = query.tab;

  // ─── Tuỳ chọn cho các bộ lọc: dựng từ CATALOG (id) — RPC lọc theo id, không theo tên ─
  // Chỉ cấp xem được nhiều phòng (showroom trở lên) mới cần lọc theo phòng — TVBH/tp_phong đã ở trong 1 phòng rồi.
  const showTeamFilter = !fixedTeamId && !isTvbh;
  const showroomOpts = useMemo<Opt[]>(
    () => showrooms.map((s) => ({ value: s.id, label: s.name })),
    [showrooms],
  );
  const brandOpts = useMemo<Opt[]>(
    () => brands.map((b) => ({ value: b.id, label: b.name })),
    [brands],
  );
  const teamOpts = useMemo<Opt[]>(
    () => teams.map((t) => ({ value: t.id, label: t.name })),
    [teams],
  );
  const modelOpts = useMemo<Opt[]>(
    () => models.filter((m) => !query.brand || m.brand_id === query.brand).map((m) => ({ value: m.id, label: m.name })),
    [models, query.brand],
  );
  const sourceOpts = useMemo<Opt[]>(
    () => sourceCatalog.platforms.map((p) => ({ value: p.name, label: p.name })),
    [sourceCatalog],
  );
  const assigneeOpts = useMemo<Opt[]>(
    () => [{ value: '__none__', label: 'Chưa giao' }, ...assignees.map((a) => ({ value: a.id, label: a.full_name }))],
    [assignees],
  );
  const statusOpts = useMemo<Opt[]>(() => [
    { value: '__none__', label: 'Chưa phân loại' },
    ...STATUS_OPTIONS.map((s) => ({ value: s.code, label: `${s.code} · ${s.label}` })),
  ], []);

  // Bấm header cột: cột đang sắp → đảo chiều; cột khác → sắp cột đó (thời gian mặc định desc, còn lại asc).
  const onSort = (key: ColKey) => {
    const sk = SORTABLE[key];
    if (!sk) return;
    if (query.sort === sk) {
      pushQuery({ ...query, dir: query.dir === 'asc' ? 'desc' : 'asc', page: 1 });
    } else {
      pushQuery({ ...query, sort: sk, dir: sk === 'time' ? 'desc' : 'asc', page: 1 });
    }
  };

  const toggleOne = (id: string) => setSel((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const doBulk = () => {
    const val = bulkAssignee === '__none__' ? null : bulkAssignee;
    const ids = [...sel];
    start(async () => {
      const r = await bulkReassign(ids, val);
      if (r.ok) { setSel(new Set()); setBulkAssignee(''); }
    });
  };

  const doDelete = () => {
    const ids = [...sel];
    start(async () => {
      const r = await deleteLeads(ids);
      if (r.ok) { setSel(new Set()); setConfirmDelete(false); }
      else alert(r.error);
    });
  };

  // Dựng CSV từ MẢNG rows truyền vào (dùng cho xuất toàn bộ, không chỉ 1 trang).
  const buildCsvAndDownload = (data: LeadRow[]) => {
    const headers = [
      'Thời gian', 'Khách hàng', 'SĐT', 'Trạng thái', 'Phân loại', 'Lý do loại',
      'Nguồn', 'Chi tiết kênh', 'Thương hiệu', 'Dòng xe', 'Showroom', 'Phòng bán hàng', 'Phụ trách',
      'Số lần LH', 'Gọi hụt', 'Hẹn gọi lại', 'Nội dung liên hệ',
    ];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = data.map((l) => [
      fmtDate(l.created_at), l.full_name ?? '', formatPhoneDisplay(l.phone),
      isContacted(l.last_contact_at) ? 'Đã liên hệ' : 'Chưa liên hệ', l.status ?? '', l.fail_reason ?? '',
      sourcePlatform(l.source, sourceCatalog), sourceLabel(l.source, sourceCatalog), l.brand_name, l.model_name ?? '',
      l.showroom_name ?? '', l.team_name ?? '', l.assignee_name ?? '', l.contact_count, l.no_answer_count,
      l.next_contact_at ? fmtDay(l.next_contact_at) : '', l.last_note ?? '',
    ].map(cell).join(','));
    const csv = '\uFEFF' + [headers.map(cell).join(','), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Xuất TOÀN BỘ lead khớp bộ lọc hiện tại (không chỉ trang đang xem) — lấy qua server action.
  const exportAll = async () => {
    setExporting(true);
    try {
      const all = await exportLeads(query);
      buildCsvAndDownload(all);
    } finally {
      setExporting(false);
    }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'pending', label: 'Chưa liên hệ' },
    { key: 'contacted', label: 'Đã liên hệ' },
    { key: 'overdue', label: 'Quá hạn' },
  ];

  const renderCell = (key: ColKey, l: LeadRow) => {
    const contacted = isContacted(l.last_contact_at);
    switch (key) {
      case 'contacted':
        return <StatusPicker lead={l} variant="contacted" pending={pending} start={start} />;
      case 'class':
        return <StatusPicker lead={l} variant="class" pending={pending} start={start} />;
      case 'failreason':
        return l.status === 'Fail' && l.fail_reason
          ? <span className="text-rose-600 line-clamp-1 max-w-[220px] inline-block align-bottom" title={l.fail_reason}>{l.fail_reason}</span>
          : <span className="text-slate-300">—</span>;
      case 'b10on':
        return l.b10_on
          ? <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><Check size={13} /></span>
          : <span className="text-slate-300">✗</span>;
      case 'b10class': {
        const o = l.b10_status ? STATUS_OPTIONS.find((s) => s.code === l.b10_status) : null;
        return o
          ? <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ color: o.color, background: o.bg }}>{o.code}</span>
          : <span className="text-slate-300">—</span>;
      }
      case 'b10note':
        return l.b10_care_note
          ? <span className="text-slate-500 line-clamp-1 max-w-[240px] inline-block align-bottom" title={l.b10_care_note}>{l.b10_care_note}</span>
          : <span className="text-slate-300">—</span>;
      case 'time': return <span className="text-slate-500">{fmtDate(l.created_at)}</span>;
      case 'name': return (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-medium text-slate-800">{l.full_name ?? '—'}</span>
          {b10Enabled && l.b10_status && (
            <History size={13} className="text-amber-500 shrink-0" aria-label="Khách cũ đã có trên B10" />
          )}
        </span>
      );
      case 'phone': return <span className="text-slate-600">{formatPhoneDisplay(l.phone)}</span>;
      case 'showroom': return <span className="text-slate-600">{l.showroom_name ?? '—'}</span>;
      case 'team': return <span className="text-slate-600">{l.team_name ?? '—'}</span>;
      case 'brand': return <span className="text-slate-600">{l.brand_name}</span>;
      case 'model': return <ModelPicker lead={l} models={models} pending={pending} start={start} />;
      case 'assignee': return <span className="text-slate-600">{l.assignee_name ?? '—'}</span>;
      case 'contactedAt':
        return <span className="text-slate-500">{contacted ? fmtDate(l.last_contact_at!) : '—'}</span>;
      case 'note':
        return <span className="text-slate-500 line-clamp-1 max-w-[220px] inline-block align-bottom">{l.last_note ?? '—'}</span>;
      case 'platform': return <span className="text-slate-600">{sourcePlatform(l.source, sourceCatalog)}</span>;
      case 'source': return <span className="text-slate-500">{sourceLabel(l.source, sourceCatalog)}</span>;
      case 'next':
        return l.next_contact_at ? (
          <span className={isOverdue(l) ? 'inline-flex items-center gap-1 text-rose-600 font-medium' : 'text-slate-500'}>
            {isOverdue(l) && <AlertTriangle size={12} />}{fmtDay(l.next_contact_at)}
          </span>
        ) : <span className="text-slate-500">—</span>;
      case 'count': return <span className="text-slate-600 tabular-nums">{l.contact_count}</span>;
    }
  };

  const colSpan = visibleCols.length + (canAssign ? 1 : 0);

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center flex-wrap gap-2 px-3 sm:px-6 py-3 border-b border-slate-100 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => pushQuery({ ...query, tab: t.key, page: 1 })}
            className="text-sm rounded-full px-3 py-1 transition-colors"
            style={{
              fontWeight: tab === t.key ? 600 : 500,
              color: tab === t.key ? (t.key === 'overdue' ? '#be123c' : 'var(--color-brand)') : '#64748b',
              background: tab === t.key ? (t.key === 'overdue' ? '#fff1f2' : '#e6f0fa') : 'transparent',
            }}
          >
            {t.label}
          </button>
        ))}

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <div className="relative flex-1 min-w-[120px] max-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
            placeholder="Tìm tên / SĐT"
            className="text-sm border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 outline-none focus:border-brand w-full"
          />
        </div>

        <TimeRangeFilter
          range={query.range}
          from={query.from}
          to={query.to}
          onChange={(v) => pushQuery({ ...query, ...v, page: 1 })}
        />

        <div className="relative">
          <button
            ref={filterBtnRef}
            onClick={openFilterMenu}
            className="inline-flex items-center gap-1.5 text-sm border rounded-lg px-2.5 py-1.5 transition-colors"
            style={{
              borderColor: activeFilters ? 'var(--color-brand)' : '#e2e8f0',
              background: activeFilters ? '#e6f0fa' : '#fff',
              color: activeFilters ? 'var(--color-brand)' : '#64748b',
              fontWeight: activeFilters ? 600 : 400,
            }}
          >
            <ListFilter size={14} /> Bộ lọc
            {activeFilters > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] text-[11px] font-semibold text-white rounded-full px-1" style={{ background: 'var(--color-brand)' }}>
                {activeFilters}
              </span>
            )}
          </button>
          {filterMenu && filterPos && createPortal(
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setFilterMenu(false)} />
              <div
                style={{
                  position: 'fixed', top: filterPos.top, left: filterPos.left, width: filterPos.width, zIndex: 9999,
                  maxHeight: '80vh', overflowY: 'auto',
                  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 14,
                }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Bộ lọc</span>
                  {activeFilters > 0 && (
                    <button onClick={clearFilters} className="text-xs text-rose-600 hover:underline">Xoá lọc</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  {[
                    { label: 'Showroom', value: query.showroom, key: 'showroom' as const, ph: 'Tất cả showroom', opts: showroomOpts },
                    ...(showTeamFilter
                      ? [{ label: 'Phòng bán hàng', value: query.team, key: 'team' as const, ph: 'Tất cả phòng', opts: teamOpts }]
                      : []),
                    { label: 'Thương hiệu', value: query.brand, key: 'brand' as const, ph: 'Tất cả thương hiệu', opts: brandOpts },
                    { label: 'Dòng xe', value: query.model, key: 'model' as const, ph: 'Tất cả dòng xe', opts: modelOpts },
                    { label: 'Nguồn', value: query.source, key: 'source' as const, ph: 'Tất cả nguồn', opts: sourceOpts },
                    { label: 'Phụ trách', value: query.assignee, key: 'assignee' as const, ph: 'Tất cả phụ trách', opts: assigneeOpts },
                    { label: 'Phân loại', value: query.status, key: 'status' as const, ph: 'Tất cả phân loại', opts: statusOpts },
                  ].map((f) => (
                    <div key={f.key} className="flex flex-col gap-1 min-w-0">
                      <span className="text-[11px] font-medium text-slate-500">{f.label}</span>
                      <Filter value={f.value} onChange={(v) => setF(f.key, v)} placeholder={f.ph} options={f.opts} />
                    </div>
                  ))}
                </div>
              </div>
            </>,
            document.body
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={exportAll}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download size={14} /> {exporting ? 'Đang xuất…' : 'Xuất CSV'}
          </button>
          <div className="relative hidden lg:block">
            <button
              ref={colBtnRef}
              onClick={openColMenu}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
            >
              <SlidersHorizontal size={14} /> Cột hiển thị
            </button>
            {colMenu && colPos && createPortal(
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setColMenu(false)} />
                <div
                  style={{
                    position: 'fixed', top: colPos.top, left: colPos.left, width: 224, zIndex: 9999,
                    maxHeight: '70vh', overflowY: 'auto',
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8,
                  }}
                >
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-2 py-1.5">Tùy chỉnh cột</div>
                  {/* Cột đóng băng (ghim trái khi cuộn ngang) — không đổi thứ tự */}
                  {STICKY.map(byKey).map((c) => (
                    <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
                      <Pin size={13} className="text-slate-300 shrink-0" />
                      <input
                        type="checkbox"
                        checked={!hidden.has(c.key)}
                        onChange={() => toggleCol(c.key)}
                        className="accent-brand"
                      />
                      <span className="flex-1">{c.label}</span>
                    </label>
                  ))}
                  <div className="my-1.5 border-t border-slate-100" />
                  <div className="text-[10px] text-slate-400 px-2 pb-1">Kéo để đổi thứ tự</div>
                  {/* Cột còn lại — kéo-thả đổi thứ tự */}
                  {order.map(byKey).filter((c) => allowB10(c.key)).map((c) => {
                    const isOver = overKey === c.key && dragKey !== c.key;
                    return (
                      <label
                        key={c.key}
                        draggable
                        onDragStart={() => setDragKey(c.key)}
                        onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                        onDragOver={(e) => { e.preventDefault(); if (overKey !== c.key) setOverKey(c.key); }}
                        onDrop={(e) => { e.preventDefault(); if (dragKey) moveCol(dragKey, c.key); setDragKey(null); setOverKey(null); }}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-700 transition-colors"
                        style={{
                          background: isOver ? '#e6f0fa' : undefined,
                          opacity: dragKey === c.key ? 0.4 : 1,
                          borderTop: isOver ? '2px solid var(--color-brand)' : '2px solid transparent',
                        }}
                      >
                        <GripVertical size={14} className="text-slate-300 shrink-0 cursor-grab active:cursor-grabbing" />
                        <input
                          type="checkbox"
                          checked={!hidden.has(c.key)}
                          onChange={() => toggleCol(c.key)}
                          className="accent-brand"
                        />
                        <span className="flex-1">{c.label}</span>
                      </label>
                    );
                  })}
                </div>
              </>,
              document.body
            )}
          </div>

          {canCreate && (
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-1.5 hover:opacity-90"
              style={{ background: 'var(--color-brand)' }}
            >
              <UserPlus size={15} /> Thêm lead
            </button>
          )}
        </div>
      </div>

      {canAssign && sel.size > 0 && (
        <div className="flex items-center flex-wrap gap-2 px-3 sm:px-6 py-2.5 bg-blue-50 border-b border-blue-100 shrink-0">
          <span className="text-sm font-semibold text-brand">Đã chọn {sel.size} lead</span>
          <select
            value={bulkAssignee}
            onChange={(e) => setBulkAssignee(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-brand outline-none"
          >
            <option value="">— Chọn người phụ trách —</option>
            <option value="__none__">Bỏ phụ trách</option>
            {assignees.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
          <button
            onClick={doBulk}
            disabled={pending || !bulkAssignee}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
            style={{ background: 'var(--color-brand)' }}
          >
            <UserPlus size={14} /> Gán hàng loạt
          </button>
          {canDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-600 border border-rose-200 bg-white hover:bg-rose-50 rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              <Trash2 size={14} /> Xoá
            </button>
          )}
          <button
            onClick={() => setSel(new Set())}
            className="text-sm text-slate-500 hover:text-slate-700 px-2 py-1.5"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {confirmDelete && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }} className="flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5">
            <div className="flex items-center gap-2 text-rose-600 mb-2">
              <AlertTriangle size={18} />
              <h3 className="text-base font-semibold">Xoá {sel.size} lead?</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Toàn bộ lịch sử chăm sóc của các lead này cũng bị xoá. Hành động không thể hoàn tác.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={pending}
                className="text-sm text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                onClick={doDelete}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                <Trash2 size={14} /> {pending ? 'Đang xoá…' : 'Xoá vĩnh viễn'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <div data-table-scroll className="flex-1 min-h-0 overflow-auto">
        {/* Mobile: danh sách thẻ (bảng nhiều cột không vừa màn hình điện thoại) */}
        <div className="lg:hidden divide-y divide-slate-100">
          {rows.map((l) => {
            const over = isOverdue(l);
            const contacted = isContacted(l.last_contact_at);
            return (
              <div
                key={l.id}
                onClick={() => setOpenLead(l)}
                className={`flex gap-3 px-3 py-3 cursor-pointer ${over ? 'bg-rose-50/60' : 'active:bg-slate-50'}`}
              >
                {canAssign && (
                  <input
                    type="checkbox"
                    onClick={(e) => e.stopPropagation()}
                    checked={sel.has(l.id)}
                    onChange={() => toggleOne(l.id)}
                    className="accent-brand mt-1 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate inline-flex items-center gap-1.5">
                        {l.full_name ?? '—'}
                        {b10Enabled && l.b10_status && (
                          <History size={13} className="text-amber-500 shrink-0" aria-label="Khách cũ đã có trên B10" />
                        )}
                      </div>
                      <div className="text-sm font-semibold text-slate-700 tabular-nums">{formatPhoneDisplay(l.phone)}</div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      <StatusPicker lead={l} variant={contacted ? 'class' : 'contacted'} pending={pending} start={start} />
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{fmtDate(l.created_at)}</span>
                    <span className="text-slate-300">·</span>
                    <span>{sourcePlatform(l.source, sourceCatalog)}</span>
                    <span className="text-slate-300">·</span>
                    <span className="truncate">{l.brand_name}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 space-y-0.5">
                    <div>Phòng: <span className="text-slate-700">{l.team_name ?? 'Chưa phân'}</span></div>
                    <div>Phụ trách: <span className="text-slate-700">{l.assignee_name ?? 'Chưa giao'}</span></div>
                    {l.status === 'Fail' && l.fail_reason && (
                      <div>Lý do loại: <span className="text-rose-600">{l.fail_reason}</span></div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="px-4 py-12 text-center text-slate-400">Không có lead nào.</div>
          )}
        </div>

        {/* Desktop: bảng đầy đủ cột */}
        <table className="hidden lg:table w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide shadow-sm">
            <tr>
              {canAssign && (
                <th
                  className="px-3 py-3"
                  style={{ position: 'sticky', left: 0, width: SEL_W, minWidth: SEL_W, zIndex: 20, background: '#f8fafc' }}
                >
                  <input
                    type="checkbox"
                    className="accent-brand align-middle"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
              )}
              {visibleCols.map((c) => {
                const sortable = SORTABLE[c.key];
                const active = !!sortable && query.sort === sortable;
                return (
                  <th key={c.key} className={`${c.pad} py-3 font-semibold whitespace-nowrap`} style={stickyStyle(c.key, true)}>
                    {sortable ? (
                      <button
                        onClick={() => onSort(c.key)}
                        className="inline-flex items-center gap-1 hover:text-brand transition-colors uppercase"
                        style={{ color: active ? 'var(--color-brand)' : undefined }}
                      >
                        {c.label}
                        {active
                          ? (query.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)
                          : <ChevronsUpDown size={12} className="opacity-30" />}
                      </button>
                    ) : (
                      <span className="uppercase">{c.label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const over = isOverdue(l);
              return (
                <tr
                  key={l.id}
                  onClick={() => setOpenLead(l)}
                  className={`border-t border-slate-100 cursor-pointer ${over ? 'bg-rose-50/60 hover:bg-rose-100/50' : 'hover:bg-slate-50/60'}`}
                >
                  {canAssign && (
                    <td
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-3"
                      style={{ position: 'sticky', left: 0, width: SEL_W, minWidth: SEL_W, zIndex: 1, background: over ? '#fff1f2' : '#fff' }}
                    >
                      <input
                        type="checkbox"
                        className="accent-brand align-middle"
                        checked={sel.has(l.id)}
                        onChange={() => toggleOne(l.id)}
                      />
                    </td>
                  )}
                  {visibleCols.map((c) => (
                    <td key={c.key} className={`${c.pad} py-3 whitespace-nowrap`} style={stickyStyle(c.key, false, over)}>
                      {renderCell(c.key, l)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={colSpan} className="px-4 py-12 text-center text-slate-400">Không có lead nào.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openLead && (
        <LeadDrawer
          lead={openLead}
          models={models}
          assignees={assignees}
          teams={teams}
          canManage={canCreate}
          b10Enabled={b10Enabled}
          sourceCatalog={sourceCatalog}
          onClose={() => setOpenLead(null)}
        />
      )}

      {showNew && (
        <NewLeadModal
          brands={formBrands}
          showrooms={formShowrooms}
          models={models}
          assignees={assignees}
          teams={formTeams}
          fixedTeamId={fixedTeamId}
          sourceCatalog={sourceCatalog}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}
