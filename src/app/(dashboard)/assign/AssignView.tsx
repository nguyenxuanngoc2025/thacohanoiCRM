'use client';

import React, { useMemo, useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { reassignLead, autoDistributeLeads, assignLeadToTeamAuto } from '../leads/actions';
import { formatPhoneDisplay } from '@/lib/phone';
import { matchTeamsForLead, matchTeamsForManager } from '@/lib/assign-routing';
import { type AssignStrategy } from '@/lib/assign';
import ModalPortal from '@/components/ui/ModalPortal';

export interface UnassignedLead {
  id: string;
  full_name: string | null;
  phone: string;
  source: string | null;
  created_at: string;
  showroom_id: string | null;
  brand_id: string | null;
  sales_team_id: string | null;
  brand_name: string;
  model_name: string | null;
  showroom_name: string | null;
}

export interface TvbhLoad {
  id: string;
  full_name: string;
  showroom_id: string | null;
  showroom_name: string | null;
  sales_team_id: string | null;
  team_name: string | null;
  share_pct: number;
  open_count: number;
}

export interface AssignTeam {
  id: string;
  name: string;
  showroom_id: string | null;
  showroom_name: string | null;
  brand_ids: string[];
  team_assign_strategy: AssignStrategy;
}

export interface AssignScope {
  kind: 'company' | 'brand' | 'showroom' | 'team' | 'assigned';
  showroomIds: string[] | null;
  brandIds: string[] | null;
  teamId: string | null;
}

const NAVY = 'var(--color-brand)';

const STRATEGIES: { value: Exclude<AssignStrategy, 'manual' | 'day_roster'>; label: string }[] = [
  { value: 'least_loaded', label: 'Chia đều' },
  { value: 'weighted', label: 'Chia theo tỷ lệ' },
  { value: 'round_robin', label: 'Xoay vòng' },
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export default function AssignView({
  leads, tvbh, teams, scope,
}: {
  leads: UnassignedLead[]; tvbh: TvbhLoad[]; teams: AssignTeam[]; scope: AssignScope;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<Exclude<AssignStrategy, 'manual' | 'day_roster'>>('least_loaded');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 4000); };

  const maxLoad = useMemo(() => Math.max(1, ...tvbh.map((t) => t.open_count)), [tvbh]);
  const tvbhByTeam = useMemo(() => {
    const m = new Map<string, TvbhLoad[]>();
    for (const t of tvbh) {
      if (!t.sales_team_id) continue;
      const arr = m.get(t.sales_team_id) ?? [];
      arr.push(t);
      m.set(t.sales_team_id, arr);
    }
    return m;
  }, [tvbh]);

  const isTeamScope = scope.kind === 'team';
  const showSrLayer = scope.kind === 'company' || scope.kind === 'brand';

  const assignOne = (leadId: string, tvbhId: string) => {
    if (!tvbhId) return;
    setBusyId(leadId);
    startTransition(async () => {
      const r = await reassignLead(leadId, tvbhId);
      setBusyId(null);
      if (!r.ok) { flashMsg(r.error ?? 'Phân giao thất bại.'); return; }
      const name = tvbh.find((t) => t.id === tvbhId)?.full_name ?? '';
      flashMsg(`Đã giao lead cho ${name}.`);
      router.refresh();
    });
  };

  const assignTeam = (leadId: string, teamId: string) => {
    setBusyId(leadId);
    startTransition(async () => {
      const r = await assignLeadToTeamAuto(leadId, teamId);
      setBusyId(null);
      if (!r.ok) { flashMsg(r.error ?? 'Phân giao thất bại.'); return; }
      const name = tvbh.find((t) => t.id === r.assigneeId)?.full_name ?? 'phòng';
      flashMsg(`Đã giao lead cho ${name}.`);
      router.refresh();
    });
  };

  const strategyLabel = STRATEGIES.find((s) => s.value === strategy)?.label ?? 'Chia đều';

  const applyAuto = () => {
    if (leads.length === 0) return;
    setConfirmOpen(true);
  };

  const runAuto = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      const r = await autoDistributeLeads(strategy);
      if (!r.ok) { flashMsg(r.error ?? 'Phân giao thất bại.'); return; }
      flashMsg(`Đã phân giao ${r.assigned} lead${r.skipped ? `, bỏ qua ${r.skipped} lead (không có TVBH phù hợp)` : ''}.`);
      router.refresh();
    });
  };

  return (
    <div className="h-full flex flex-col p-3 sm:p-6 gap-3 sm:gap-4">
      {flash && (
        <div className="shrink-0 px-4 py-2.5 text-sm bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg">
          {flash}
        </div>
      )}

      {confirmOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40" onClick={() => setConfirmOpen(false)}>
            <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold text-slate-900">Xác nhận phân giao</h3>
              <p className="text-sm text-slate-600 mt-2">
                Phân giao <b>{leads.length}</b> lead chưa giao theo kiểu <b>“{strategyLabel}”</b>?
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setConfirmOpen(false)}
                  className="text-sm font-semibold text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-100">
                  Huỷ
                </button>
                <button onClick={runAuto}
                  className="text-sm font-semibold text-white rounded-lg px-3 py-1.5 hover:opacity-90"
                  style={{ background: `linear-gradient(135deg, ${NAVY}, #0468BF)` }}>
                  Áp dụng
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
        {/* Lead chưa giao */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0">
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 p-5 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Lead chưa giao ({leads.length})</h2>
              <p className="text-xs text-slate-400 mt-0.5">Chọn tư vấn/phòng cho từng lead, hoặc chia tự động theo kiểu.</p>
            </div>
            <div className="flex items-center gap-2">
              <StrategyPicker value={strategy} onChange={setStrategy} disabled={pending} />
              <button
                onClick={applyAuto}
                disabled={pending || leads.length === 0}
                className="shrink-0 text-sm font-semibold text-white rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${NAVY}, #0468BF)` }}
              >
                Áp dụng
              </button>
            </div>
          </div>

          {leads.length === 0 ? (
            <div className="px-5 py-12 text-center text-slate-400 text-sm">Tất cả lead đã có người phụ trách.</div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              {/* Mobile: thẻ */}
              <div className="lg:hidden divide-y divide-slate-100">
                {leads.map((l) => (
                  <div key={l.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 truncate">{l.full_name ?? 'Khách lẻ'}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{formatPhoneDisplay(l.phone)}{l.source ? ` · ${l.source}` : ''}</div>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500 whitespace-nowrap">{fmtDate(l.created_at)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-slate-600">{l.brand_name}</span>
                      {l.model_name && <span className="inline-flex font-medium text-slate-700 bg-slate-100 rounded-full px-2 py-0.5">{l.model_name}</span>}
                      {l.showroom_name && <span className="text-slate-400">· {l.showroom_name}</span>}
                    </div>
                    <AssignPicker
                      lead={l} teams={teams} tvbhByTeam={tvbhByTeam}
                      isTeamScope={isTeamScope} showSrLayer={showSrLayer}
                      busy={pending && (busyId === l.id || busyId === null)}
                      onPickTvbh={(id) => assignOne(l.id, id)}
                      onPickTeam={(id) => assignTeam(l.id, id)}
                    />
                  </div>
                ))}
              </div>

              {/* Desktop: bảng */}
              <table className="hidden lg:table w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Khách hàng</th>
                    <th className="px-3 py-2.5 font-semibold">Thương hiệu</th>
                    <th className="px-3 py-2.5 font-semibold">Dòng xe</th>
                    <th className="px-3 py-2.5 font-semibold">Showroom</th>
                    <th className="px-3 py-2.5 font-semibold">Ngày</th>
                    <th className="px-5 py-2.5 font-semibold text-right">Giao cho</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-5 py-2.5">
                        <div className="font-medium text-slate-800">{l.full_name ?? 'Khách lẻ'}</div>
                        <div className="text-xs text-slate-400">{formatPhoneDisplay(l.phone)}{l.source ? ` · ${l.source}` : ''}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{l.brand_name}</td>
                      <td className="px-3 py-2.5">
                        {l.model_name
                          ? <span className="inline-flex text-xs font-medium text-slate-700 bg-slate-100 rounded-full px-2 py-0.5">{l.model_name}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{l.showroom_name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex justify-end">
                          <AssignPicker
                            lead={l} teams={teams} tvbhByTeam={tvbhByTeam}
                            isTeamScope={isTeamScope} showSrLayer={showSrLayer}
                            busy={pending && (busyId === l.id || busyId === null)}
                            onPickTvbh={(id) => assignOne(l.id, id)}
                            onPickTeam={(id) => assignTeam(l.id, id)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Tải công việc TVBH — gộp theo phòng (cấp showroom trở lên) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0">
          <div className="shrink-0 p-5 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Số lead đang phụ trách</h2>
            <p className="text-xs text-slate-400 mt-0.5">Mỗi tư vấn bán hàng đang chăm sóc bao nhiêu khách hàng.</p>
          </div>
          {tvbh.length === 0 ? (
            <p className="text-sm text-slate-400 p-5">Chưa có tư vấn bán hàng nào.</p>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto p-5 pt-3 space-y-3">
              <WorkloadPanel tvbh={tvbh} maxLoad={maxLoad} grouped={!isTeamScope} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Dropdown chọn kiểu chia — custom popup đồng bộ với AssignPicker. */
function StrategyPicker({
  value, onChange, disabled,
}: {
  value: Exclude<AssignStrategy, 'manual' | 'day_roster'>;
  onChange: (v: Exclude<AssignStrategy, 'manual' | 'day_roster'>) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const current = STRATEGIES.find((s) => s.value === value);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 160) });
    setOpen(true);
  };
  const pick = (v: Exclude<AssignStrategy, 'manual' | 'day_roster'>) => { setOpen(false); onChange(v); };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        disabled={disabled}
        className="inline-flex items-center justify-between gap-1.5 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none hover:border-brand disabled:opacity-50 min-w-[150px]"
      >
        <span className="text-slate-700">{current?.label ?? 'Chia đều'}</span>
        <ChevronDown size={13} className="opacity-60 shrink-0" />
      </button>
      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6,
          }}>
            {STRATEGIES.map((s) => (
              <button key={s.value} onClick={() => pick(s.value)}
                className="block w-full text-left text-sm rounded-md px-2.5 py-1.5 hover:bg-slate-50"
                style={{ color: value === s.value ? NAVY : '#475569', fontWeight: value === s.value ? 600 : 400 }}>
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** Dropdown "Giao cho": gộp theo phòng, mở rộng ra TVBH. Cấp phòng = danh sách phẳng. */
function AssignPicker({
  lead, teams, tvbhByTeam, isTeamScope, showSrLayer, busy, onPickTvbh, onPickTeam,
}: {
  lead: UnassignedLead;
  teams: AssignTeam[];
  tvbhByTeam: Map<string, TvbhLoad[]>;
  isTeamScope: boolean;
  showSrLayer: boolean;
  busy: boolean;
  onPickTvbh: (tvbhId: string) => void;
  onPickTeam: (teamId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Cấp phòng (tp_phong): chỉ phòng lead đang thuộc → danh sách phẳng TVBH.
  const matched = useMemo(() => matchTeamsForLead(lead, teams), [lead, teams]);
  // Cấp quản lý: MỌI phòng có thể nhận, phòng đề xuất lên đầu (chuyển phòng được).
  const manager = useMemo(() => matchTeamsForManager(lead, teams), [lead, teams]);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 320), width: 320 });
    setOpen(true);
  };
  const toggleTeam = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const pickTvbh = (id: string) => { setOpen(false); onPickTvbh(id); };
  const pickTeam = (id: string) => { setOpen(false); onPickTeam(id); };

  // Cấp phòng: danh sách phẳng TVBH của các phòng khớp.
  const flatTvbh = useMemo(() => matched.flatMap((tm) => tvbhByTeam.get(tm.id) ?? []), [matched, tvbhByTeam]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        disabled={busy}
        className="inline-flex items-center justify-between gap-1.5 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none hover:border-brand disabled:opacity-50 min-w-[170px]"
      >
        <span className="text-slate-500">{busy ? 'Đang giao…' : 'Chọn người/phòng'}</span>
        <ChevronDown size={13} className="opacity-60 shrink-0" />
      </button>
      {open && pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, maxHeight: 320,
            overflowY: 'auto', overflowX: 'hidden',
          }}>
            {isTeamScope ? (
              flatTvbh.length === 0
                ? <div className="px-2.5 py-2 text-xs text-slate-400">Không có tư vấn bán hàng phù hợp.</div>
                : flatTvbh.map((t) => (
                    <button key={t.id} onClick={() => pickTvbh(t.id)}
                      className="block w-full text-left text-sm rounded-md px-2.5 py-1.5 hover:bg-slate-50 text-slate-700">
                      {t.full_name} <span className="text-slate-400">({t.open_count})</span>
                    </button>
                  ))
            ) : manager.teams.length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-slate-400">Không có phòng phù hợp.</div>
            ) : (
              manager.teams.map((tm) => {
                const members = tvbhByTeam.get(tm.id) ?? [];
                const isOpen = expanded.has(tm.id);
                const isRec = tm.id === manager.recommendedId;
                return (
                  <div key={tm.id} className="mb-0.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <button onClick={() => toggleTeam(tm.id)}
                        className="flex-1 min-w-0 flex items-center gap-1.5 text-left text-sm rounded-md px-2 py-1.5 hover:bg-slate-50 font-medium text-slate-700">
                        {isOpen ? <ChevronDown size={13} className="opacity-60 shrink-0" /> : <ChevronRight size={13} className="opacity-60 shrink-0" />}
                        <span className="truncate">{tm.name}{showSrLayer && tm.showroom_name ? ` · ${tm.showroom_name}` : ''}</span>
                        {isRec && (
                          <span className="shrink-0 text-[10px] font-semibold rounded px-1.5 py-0.5 text-white" style={{ background: NAVY }}>
                            Phòng đề xuất
                          </span>
                        )}
                        <span className="text-slate-400 text-xs shrink-0">({members.length})</span>
                      </button>
                      <button onClick={() => pickTeam(tm.id)} title="Giao cả phòng (tự chọn 1 TVBH)"
                        className="shrink-0 text-[11px] font-semibold rounded-md px-2 py-1 text-white hover:opacity-90" style={{ background: NAVY }}>
                        Giao phòng
                      </button>
                    </div>
                    {isOpen && (
                      members.length === 0
                        ? <div className="pl-7 pr-2 py-1 text-xs text-slate-400">Phòng chưa có TVBH.</div>
                        : members.map((t) => (
                            <button key={t.id} onClick={() => pickTvbh(t.id)}
                              className="block w-full text-left text-sm rounded-md pl-7 pr-2.5 py-1.5 hover:bg-slate-50 text-slate-600">
                              {t.full_name} <span className="text-slate-400">({t.open_count})</span>
                            </button>
                          ))
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </>
  );
}

/** Panel tải: gộp theo phòng (grouped) hoặc phẳng. */
function WorkloadPanel({ tvbh, maxLoad, grouped }: { tvbh: TvbhLoad[]; maxLoad: number; grouped: boolean }) {
  const Bar = ({ t }: { t: TvbhLoad }) => (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{t.full_name}</span>
        <span className="text-slate-500">{t.open_count}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${(t.open_count / maxLoad) * 100}%`, background: NAVY }} />
        </div>
      </div>
    </div>
  );

  if (!grouped) {
    return (
      <div className="space-y-2.5">
        {[...tvbh].sort((a, b) => b.open_count - a.open_count).map((t) => (
          <div key={t.id}>
            <Bar t={t} />
            {t.team_name && <div className="text-[11px] text-slate-400 mt-0.5">{t.team_name}</div>}
          </div>
        ))}
      </div>
    );
  }

  // Gộp theo phòng.
  const groups = new Map<string, { key: string; name: string; members: TvbhLoad[] }>();
  for (const t of tvbh) {
    const key = t.sales_team_id ?? '__none__';
    const name = t.team_name ?? 'Chưa gán phòng';
    const g = groups.get(key) ?? { key, name, members: [] };
    g.members.push(t);
    groups.set(key, g);
  }
  const ordered = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  return (
    <div className="space-y-4">
      {ordered.map((g) => {
        const total = g.members.reduce((s, m) => s + m.open_count, 0);
        return (
          <div key={g.key}>
            <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <Users size={12} className="opacity-60" />
              <span>{g.name}</span>
              <span className="text-slate-400 normal-case">· {total} lead</span>
            </div>
            <div className="space-y-2.5">
              {[...g.members].sort((a, b) => b.open_count - a.open_count).map((t) => <Bar key={t.id} t={t} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
