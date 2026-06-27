'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch, Plus, Edit2, Trash2, X, Clock, Bell, ChevronRight, ChevronDown, Building2, Boxes, User } from 'lucide-react';
import type { ShowroomRow, SalesTeamRow, AssignmentRuleRow, SlaRow, AssignStrategy } from './types';
import type { StaffRow } from './AccountsManager';
import {
  PanelHeader, PrimaryBtn, GhostBtn, Field, TextInput, Select, Toggle, StatusPill, FlashBar, Panel, postAdmin,
} from './ui';

// Nhãn 3 kiểu chia dùng chung mọi cấp.
const STRATEGY_LABELS: Record<AssignStrategy, string> = {
  least_loaded: 'Ít lead nhất',
  round_robin: 'Xoay vòng',
  weighted: 'Theo tỷ lệ %',
};

export default function AssignmentManager({
  showrooms, salesTeams, staff, rules, sla, companyId, companyShowroomStrategy,
}: {
  showrooms: ShowroomRow[];
  salesTeams: SalesTeamRow[];
  staff: StaffRow[];
  rules: AssignmentRuleRow[];
  sla: SlaRow[];
  companyId: string;
  companyShowroomStrategy: AssignStrategy;
}) {
  const router = useRouter();
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };
  const [edit, setEdit] = useState<AssignmentRuleRow | 'new' | null>(null);

  const tvbhList = staff.filter((s) => s.role === 'tvbh');
  // Chỉ hiện luật ghim TVBH thật sự; luật fallback mặc định (least_loaded, chưa gán TVBH) ẩn đi cho đỡ rối.
  const pinRules = rules.filter((r) => r.strategy === 'specific_user' && r.specific_user_id);
  const showroomName = (id: string | null) => id ? (showrooms.find((s) => s.id === id)?.name ?? '—') : 'Toàn công ty (mặc định)';
  const userName = (id: string | null) => id ? (staff.find((s) => s.id === id)?.full_name ?? '—') : '—';

  const delRule = async (r: AssignmentRuleRow) => {
    if (!window.confirm('Xoá luật phân giao này?')) return;
    const res = await postAdmin('/api/admin/assignment-rules', { op: 'delete', id: r.id });
    if (!res.ok) { window.alert(res.error); return; }
    flashMsg('Đã xoá luật phân giao.'); router.refresh();
  };

  return (
    <div className="space-y-4">
      <FlashBar msg={flash} />

      {/* Cây phân giao 3 cấp — làm trọn 1 chỗ */}
      <Panel>
        <PanelHeader
          title="Cây phân giao lead"
          desc="Đặt kiểu chia cho cả 3 cấp tại đây: công ty → showroom → phòng → TVBH. Mở từng nhánh để chỉnh sâu hơn."
        />
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3.5 mb-4 text-[13px] leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-800">3 kiểu chia:</span>{' '}
          <b>Ít lead nhất</b> (ưu tiên nơi đang giữ ít lead chờ nhất) ·{' '}
          <b>Xoay vòng</b> (nơi lâu nhất chưa nhận thì tới lượt) ·{' '}
          <b>Theo tỷ lệ %</b> (mỗi nơi một phần trăm, tổng nên bằng 100%).
        </div>
        <AssignmentTree
          companyShowroomStrategy={companyShowroomStrategy}
          showrooms={showrooms}
          salesTeams={salesTeams}
          staff={staff}
          onDone={(m) => { flashMsg(m); router.refresh(); }}
        />
      </Panel>

      {/* Thời hạn liên hệ và nhắc nhở (thay SLA) */}
      <Panel>
        <PanelHeader
          title="Thời hạn liên hệ và nhắc nhở"
          desc="Quy định TVBH phải liên hệ khách trong bao lâu và nhịp nhắc khi quá hạn."
        />
        <ContactDeadlinePanel sla={sla} companyId={companyId} onDone={(m) => { flashMsg(m); router.refresh(); }} />
      </Panel>

      {/* Luật ghim TVBH cố định */}
      <Panel>
        <PanelHeader
          title="Luật phân giao đặc biệt"
          desc="Luật ghi đè: ghim toàn bộ lead của 1 showroom về 1 TVBH cố định (ưu tiên cao hơn cây phân giao ở trên)."
          action={<PrimaryBtn onClick={() => setEdit('new')}><Plus size={15} /> Thêm luật</PrimaryBtn>}
        />
        <div className="overflow-hidden rounded-lg border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Phạm vi</th>
                <th className="px-4 py-2.5 font-semibold">TVBH cố định</th>
                <th className="px-4 py-2.5 font-semibold text-center">Ưu tiên</th>
                <th className="px-4 py-2.5 font-semibold text-center">Trạng thái</th>
                <th className="px-4 py-2.5 font-semibold text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pinRules.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-800 flex items-center gap-2">
                    <GitBranch size={14} style={{ color: '#004B9B' }} /> {showroomName(r.showroom_id)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    <span className="font-medium text-slate-800">{userName(r.specific_user_id)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-600">{r.priority}</td>
                  <td className="px-4 py-2.5 text-center"><StatusPill active={r.is_active} /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <IconBtn title="Sửa" onClick={() => setEdit(r)}><Edit2 size={14} style={{ color: '#004B9B' }} /></IconBtn>
                      <IconBtn title="Xoá" onClick={() => delRule(r)}><Trash2 size={14} className="text-rose-600" /></IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
              {pinRules.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Chưa có luật ghim — lead chia theo cây phân giao ở trên.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {edit && (
        <RuleModal target={edit} showrooms={showrooms} tvbhList={tvbhList}
          onClose={() => setEdit(null)}
          onDone={(m) => { setEdit(null); flashMsg(m); router.refresh(); }} />
      )}
    </div>
  );
}

// Select 3 kiểu chia dùng chung.
function StratSelect({ value, disabled, onChange }: { value: AssignStrategy; disabled?: boolean; onChange: (v: AssignStrategy) => void }) {
  return (
    <Select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as AssignStrategy)}>
      <option value="least_loaded">{STRATEGY_LABELS.least_loaded}</option>
      <option value="round_robin">{STRATEGY_LABELS.round_robin}</option>
      <option value="weighted">{STRATEGY_LABELS.weighted}</option>
    </Select>
  );
}

// Ô nhập % + nút lưu, dùng chung cho showroom / phòng / TVBH.
function PctInput({ value, onChange, onSave, busy }: { value: string; onChange: (v: string) => void; onSave: () => void; busy: boolean }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className="w-20">
        <TextInput type="number" min={0} value={value} disabled={busy}
          onChange={(e) => onChange(e.target.value)} onBlur={onSave} />
      </div>
      <span className="text-xs text-slate-400">%</span>
    </div>
  );
}

// Nhãn tổng % của một nhóm.
function TotalBadge({ total }: { total: number }) {
  return (
    <span className="text-xs">
      Tổng: <span className={total === 100 ? 'font-bold text-emerald-600' : 'font-bold text-amber-600'}>{total}%</span>
      {total !== 100 && <span className="text-slate-400"> (nên 100%)</span>}
    </span>
  );
}

// Cây phân giao: 1 màn hình đặt kiểu chia cả 3 cấp.
function AssignmentTree({
  companyShowroomStrategy, showrooms, salesTeams, staff, onDone,
}: {
  companyShowroomStrategy: AssignStrategy;
  showrooms: ShowroomRow[];
  salesTeams: SalesTeamRow[];
  staff: StaffRow[];
  onDone: (m: string) => void;
}) {
  const tvbh = staff.filter((s) => s.role === 'tvbh');

  const [coStrat, setCoStrat] = useState<AssignStrategy>(companyShowroomStrategy);
  const [srStrat, setSrStrat] = useState<Record<string, AssignStrategy>>(
    Object.fromEntries(showrooms.map((s) => [s.id, s.team_assign_strategy])),
  );
  const [srPct, setSrPct] = useState<Record<string, string>>(
    Object.fromEntries(showrooms.map((s) => [s.id, String(s.assign_share_pct ?? 0)])),
  );
  const [tmStrat, setTmStrat] = useState<Record<string, AssignStrategy>>(
    Object.fromEntries(salesTeams.map((t) => [t.id, t.tvbh_assign_strategy])),
  );
  const [tmPct, setTmPct] = useState<Record<string, string>>(
    Object.fromEntries(salesTeams.map((t) => [t.id, String(t.assign_share_pct ?? 0)])),
  );
  const [tvbhPct, setTvbhPct] = useState<Record<string, string>>(
    Object.fromEntries(tvbh.map((u) => [u.id, String(u.assign_share_pct ?? 0)])),
  );

  const [openSr, setOpenSr] = useState<Record<string, boolean>>({});
  const [openTm, setOpenTm] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const teamsOf = (showroomId: string) => salesTeams.filter((t) => t.showroom_id === showroomId);
  const tvbhOf = (teamId: string) => tvbh.filter((u) => u.sales_team_id === teamId);

  const saveCo = async (next: AssignStrategy) => {
    const prev = coStrat;
    setCoStrat(next); setBusy('co');
    const r = await postAdmin('/api/admin/assignment-rules', { op: 'set-company-strategy', showroom_assign_strategy: next });
    setBusy(null);
    if (!r.ok) { window.alert(r.error); setCoStrat(prev); return; }
    onDone('Đã đổi kiểu chia vào showroom.');
  };

  const saveSrStrat = async (s: ShowroomRow, next: AssignStrategy) => {
    const prev = srStrat[s.id];
    setSrStrat((v) => ({ ...v, [s.id]: next })); setBusy(`sr-${s.id}`);
    const r = await postAdmin('/api/admin/showrooms', {
      op: 'update', id: s.id, name: s.name, code: s.code, brand_ids: s.brand_ids, team_assign_strategy: next,
    });
    setBusy(null);
    if (!r.ok) { window.alert(r.error); setSrStrat((v) => ({ ...v, [s.id]: prev })); return; }
    onDone(`Đã đổi kiểu chia của showroom ${s.name}.`);
  };

  const saveSrPct = async (s: ShowroomRow) => {
    setBusy(`srpct-${s.id}`);
    const r = await postAdmin('/api/admin/showrooms', {
      op: 'update', id: s.id, name: s.name, code: s.code, brand_ids: s.brand_ids, assign_share_pct: Number(srPct[s.id]) || 0,
    });
    setBusy(null);
    if (!r.ok) { window.alert(r.error); return; }
    onDone(`Đã lưu tỷ lệ showroom ${s.name}.`);
  };

  const saveTmStrat = async (t: SalesTeamRow, next: AssignStrategy) => {
    const prev = tmStrat[t.id];
    setTmStrat((v) => ({ ...v, [t.id]: next })); setBusy(`tm-${t.id}`);
    const r = await postAdmin('/api/admin/sales-teams', { op: 'set-strategy', sales_team_id: t.id, tvbh_assign_strategy: next });
    setBusy(null);
    if (!r.ok) { window.alert(r.error); setTmStrat((v) => ({ ...v, [t.id]: prev })); return; }
    onDone(`Đã đổi kiểu chia của phòng ${t.name}.`);
  };

  const saveTmPct = async (t: SalesTeamRow) => {
    setBusy(`tmpct-${t.id}`);
    const r = await postAdmin('/api/admin/sales-teams', { op: 'set-strategy', sales_team_id: t.id, assign_share_pct: Number(tmPct[t.id]) || 0 });
    setBusy(null);
    if (!r.ok) { window.alert(r.error); return; }
    onDone(`Đã lưu tỷ lệ phòng ${t.name}.`);
  };

  const saveTvbhPct = async (u: StaffRow) => {
    setBusy(`tvbh-${u.id}`);
    const r = await postAdmin('/api/admin/update-user', { userId: u.id, assign_share_pct: Number(tvbhPct[u.id]) || 0 });
    setBusy(null);
    if (!r.ok) { window.alert(r.error); return; }
    onDone(`Đã lưu tỷ lệ TVBH ${u.full_name ?? ''}.`);
  };

  const srTotal = showrooms.reduce((acc, s) => acc + (Number(srPct[s.id]) || 0), 0);

  return (
    <div className="space-y-3">
      {/* Cấp 1: công ty → showroom */}
      <div className="border border-slate-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-2">
          <Building2 size={15} style={{ color: '#004B9B' }} /> Công ty chia lead vào các showroom
        </div>
        <div className="max-w-xs">
          <StratSelect value={coStrat} disabled={busy === 'co'} onChange={saveCo} />
        </div>
        {coStrat === 'weighted' && (
          <div className="mt-2 pl-1">
            <TotalBadge total={srTotal} />
          </div>
        )}
      </div>

      {/* Cấp 2 + 3: từng showroom → phòng → TVBH */}
      {showrooms.length === 0 && (
        <div className="text-sm text-slate-400 px-1">Chưa có showroom. Thêm ở tab "Showroom · Thương hiệu".</div>
      )}
      {showrooms.map((s) => {
        const teams = teamsOf(s.id);
        const tmTotal = teams.reduce((acc, t) => acc + (Number(tmPct[t.id]) || 0), 0);
        const isOpen = !!openSr[s.id];
        return (
          <div key={s.id} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* Hàng showroom */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50">
              <button onClick={() => setOpenSr((v) => ({ ...v, [s.id]: !v[s.id] }))}
                className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 shrink-0">
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <Building2 size={15} className="text-slate-500 shrink-0" />
              <span className="flex-1 text-sm font-semibold text-slate-800 truncate">{s.name}</span>
              {coStrat === 'weighted' && (
                <PctInput value={srPct[s.id] ?? '0'} busy={busy === `srpct-${s.id}`}
                  onChange={(val) => setSrPct((v) => ({ ...v, [s.id]: val }))} onSave={() => saveSrPct(s)} />
              )}
            </div>

            {isOpen && (
              <div className="p-3 space-y-3 border-t border-slate-100">
                {/* Cấp 2: showroom → phòng */}
                <div className="pl-2">
                  <div className="text-xs font-semibold text-slate-500 mb-1.5">Showroom này chia lead vào các phòng:</div>
                  <div className="max-w-xs">
                    <StratSelect value={srStrat[s.id] ?? 'weighted'} disabled={busy === `sr-${s.id}`}
                      onChange={(next) => saveSrStrat(s, next)} />
                  </div>
                  {srStrat[s.id] === 'weighted' && teams.length > 0 && (
                    <div className="mt-1.5"><TotalBadge total={tmTotal} /></div>
                  )}
                </div>

                {/* Danh sách phòng */}
                {teams.length === 0 && (
                  <div className="text-xs text-slate-400 pl-2">Showroom chưa có phòng bán hàng.</div>
                )}
                {teams.map((t) => {
                  const members = tvbhOf(t.id);
                  const memTotal = members.reduce((acc, u) => acc + (Number(tvbhPct[u.id]) || 0), 0);
                  const tmOpen = !!openTm[t.id];
                  return (
                    <div key={t.id} className="ml-2 border-l-2 border-slate-100 pl-3">
                      <div className="flex items-center gap-2 py-1">
                        <button onClick={() => setOpenTm((v) => ({ ...v, [t.id]: !v[t.id] }))}
                          className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 shrink-0">
                          {tmOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </button>
                        <Boxes size={14} className="text-slate-400 shrink-0" />
                        <span className="flex-1 text-sm text-slate-700 truncate">{t.name}</span>
                        {srStrat[s.id] === 'weighted' && (
                          <PctInput value={tmPct[t.id] ?? '0'} busy={busy === `tmpct-${t.id}`}
                            onChange={(val) => setTmPct((v) => ({ ...v, [t.id]: val }))} onSave={() => saveTmPct(t)} />
                        )}
                      </div>

                      {tmOpen && (
                        <div className="pl-8 pb-2 pt-1 space-y-2">
                          {/* Cấp 3: phòng → TVBH */}
                          <div>
                            <div className="text-xs font-semibold text-slate-500 mb-1.5">Phòng này chia lead cho TVBH:</div>
                            <div className="max-w-xs">
                              <StratSelect value={tmStrat[t.id] ?? 'least_loaded'} disabled={busy === `tm-${t.id}`}
                                onChange={(next) => saveTmStrat(t, next)} />
                            </div>
                            {tmStrat[t.id] === 'weighted' && members.length > 0 && (
                              <div className="mt-1.5"><TotalBadge total={memTotal} /></div>
                            )}
                          </div>
                          {members.length === 0 && (
                            <div className="text-xs text-slate-400">Phòng chưa có TVBH.</div>
                          )}
                          {members.map((u) => (
                            <div key={u.id} className="flex items-center gap-2 py-0.5">
                              <User size={13} className="text-slate-400 shrink-0" />
                              <span className="flex-1 text-sm text-slate-600 truncate">{u.full_name ?? u.email}</span>
                              {tmStrat[t.id] === 'weighted' && (
                                <PctInput value={tvbhPct[u.id] ?? '0'} busy={busy === `tvbh-${u.id}`}
                                  onChange={(val) => setTvbhPct((v) => ({ ...v, [u.id]: val }))} onSave={() => saveTvbhPct(u)} />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Thời hạn liên hệ lần đầu + khoảng cách 2 lần nhắc (chỉ row round=1 của sla_config).
function ContactDeadlinePanel({
  sla, companyId, onDone,
}: { sla: SlaRow[]; companyId: string; onDone: (m: string) => void }) {
  const row = sla.find((s) => s.round === 1);
  const [frh, setFrh] = useState(String(row?.first_response_hours ?? 2));
  const [fuh, setFuh] = useState(String(row?.follow_up_hours ?? 2));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const r = await postAdmin('/api/admin/sla', {
      round: 1, first_response_hours: Number(frh), follow_up_hours: Number(fuh), is_active: true, company_id: companyId,
    });
    setBusy(false);
    if (!r.ok) { window.alert(r.error); return; }
    onDone('Đã lưu thời hạn liên hệ.');
  };

  const X = Number(frh) || 0;
  const Y = Number(fuh) || 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-50 border border-slate-100 p-4 space-y-3 text-sm text-slate-600">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Bell size={15} style={{ color: '#004B9B' }} /> TVBH có trách nhiệm gì khi nhận lead?
        </div>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 w-5 h-5 shrink-0 inline-flex items-center justify-center rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700">1</span>
          <p>Khi lead được giao, TVBH phải <span className="font-semibold text-slate-800">liên hệ khách trong {X} giờ</span>.</p>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 w-5 h-5 shrink-0 inline-flex items-center justify-center rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700">2</span>
          <p>Quá hạn chưa liên hệ → hệ thống <span className="font-semibold text-slate-800">nhắc lần 1</span> vào nhóm Zalo showroom (kèm tên khách + tên TVBH).</p>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 w-5 h-5 shrink-0 inline-flex items-center justify-center rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700">3</span>
          <p>Sau <span className="font-semibold text-slate-800">{Y} giờ</span> vẫn chưa liên hệ → <span className="font-semibold text-slate-800">nhắc lần 2</span>.</p>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 w-5 h-5 shrink-0 inline-flex items-center justify-center rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700">4</span>
          <p>Vẫn chưa liên hệ → ngừng nhắc Zalo; lead + tên TVBH vào <span className="font-semibold text-slate-800">báo cáo cuối ngày</span> (mục chưa tuân thủ).</p>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 w-5 h-5 shrink-0 inline-flex items-center justify-center rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700">5</span>
          <p>Khi TVBH đã đánh dấu liên hệ / phân loại lead → <span className="font-semibold text-slate-800">dừng mọi nhắc</span> cho lead đó.</p>
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg p-4 space-y-3 max-w-md">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Clock size={14} style={{ color: '#004B9B' }} /> Cấu hình (áp dụng toàn công ty)
        </div>
        <Field label="Hạn liên hệ lần đầu (giờ)"><TextInput type="number" min={0} value={frh} onChange={(e) => setFrh(e.target.value)} /></Field>
        <Field label="Khoảng cách giữa 2 lần nhắc (giờ)"><TextInput type="number" min={0} value={fuh} onChange={(e) => setFuh(e.target.value)} /></Field>
        <PrimaryBtn onClick={save} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu thời hạn'}</PrimaryBtn>
      </div>
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick}
      className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50 transition-colors">
      {children}
    </button>
  );
}

function RuleModal({
  target, showrooms, tvbhList, onClose, onDone,
}: {
  target: AssignmentRuleRow | 'new';
  showrooms: ShowroomRow[];
  tvbhList: StaffRow[];
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const isNew = target === 'new';
  const init = isNew ? null : target;
  const [showroomId, setShowroomId] = useState(init?.showroom_id ?? '');
  const [userId, setUserId] = useState(init?.specific_user_id ?? '');
  const [priority, setPriority] = useState(String(init?.priority ?? (init?.showroom_id ? 10 : 0)));
  const [isActive, setIsActive] = useState(init?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!userId) { setError('Chọn TVBH cố định.'); return; }
    setBusy(true);
    const r = await postAdmin('/api/admin/assignment-rules', {
      op: isNew ? 'create' : 'update',
      id: isNew ? undefined : (target as AssignmentRuleRow).id,
      showroom_id: showroomId || null,
      strategy: 'specific_user',
      specific_user_id: userId,
      priority: Number(priority) || 0,
      is_active: isActive,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? null); return; }
    onDone(isNew ? 'Đã thêm luật ghim TVBH.' : 'Đã cập nhật luật.');
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{isNew ? 'Thêm luật ghim TVBH' : 'Sửa luật ghim TVBH'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Phạm vi" hint="Để trống = ghim cho toàn công ty.">
            <Select value={showroomId} onChange={(e) => setShowroomId(e.target.value)}>
              <option value="">Toàn công ty (mặc định)</option>
              {showrooms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="TVBH nhận toàn bộ lead">
            <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">— Chọn TVBH —</option>
              {tvbhList.map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
            </Select>
          </Field>
          <Field label="Ưu tiên" hint="Số cao hơn được áp dụng trước. Luật showroom nên > luật mặc định.">
            <TextInput type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
          </Field>
          <Toggle checked={isActive} onChange={setIsActive} label="Luật đang áp dụng" />
          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <GhostBtn onClick={onClose} disabled={busy}>Hủy</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}
