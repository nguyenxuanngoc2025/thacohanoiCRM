'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch, Plus, Edit2, Trash2, X, Clock } from 'lucide-react';
import type { ShowroomRow, AssignmentRuleRow, SlaRow } from './types';
import type { StaffRow } from './AccountsManager';
import {
  PanelHeader, PrimaryBtn, GhostBtn, Field, TextInput, Select, Toggle, StatusPill, FlashBar, Panel, postAdmin,
} from './ui';

export default function AssignmentManager({
  showrooms, staff, rules, sla, companyId,
}: {
  showrooms: ShowroomRow[];
  staff: StaffRow[];
  rules: AssignmentRuleRow[];
  sla: SlaRow[];
  companyId: string;
}) {
  const router = useRouter();
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };
  const [edit, setEdit] = useState<AssignmentRuleRow | 'new' | null>(null);

  const tvbhList = staff.filter((s) => s.role === 'tvbh');
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

      {/* Assignment rules */}
      <Panel>
        <PanelHeader
          title="Quy tắc phân giao lead"
          desc="Luật showroom (ưu tiên cao) ghi đè luật mặc định toàn công ty. 'Luân phiên đều' chia cho TVBH ít lead nhất; 'TVBH cố định' dồn về 1 người."
          action={<PrimaryBtn onClick={() => setEdit('new')}><Plus size={15} /> Thêm luật</PrimaryBtn>}
        />
        <div className="overflow-hidden rounded-lg border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Phạm vi</th>
                <th className="px-4 py-2.5 font-semibold">Cách chia</th>
                <th className="px-4 py-2.5 font-semibold text-center">Ưu tiên</th>
                <th className="px-4 py-2.5 font-semibold text-center">Trạng thái</th>
                <th className="px-4 py-2.5 font-semibold text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-800 flex items-center gap-2">
                    <GitBranch size={14} style={{ color: '#004B9B' }} /> {showroomName(r.showroom_id)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {r.strategy === 'least_loaded'
                      ? 'Luân phiên đều'
                      : <>TVBH cố định · <span className="font-medium text-slate-800">{userName(r.specific_user_id)}</span></>}
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
              {rules.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Chưa có luật phân giao.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* SLA config */}
      <Panel>
        <PanelHeader
          title="SLA — thời hạn phản hồi theo vòng"
          desc="Vòng 1 = lead mới. Mỗi vòng đặt thời hạn liên hệ lần đầu và khoảng cách giữa các lần chăm sóc. Lead quá hạn sẽ được cảnh báo."
        />
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {[1, 2, 3].map((round) => {
            const row = sla.find((s) => s.round === round);
            return <SlaCard key={round} round={round} row={row} companyId={companyId} onDone={(m) => { flashMsg(m); router.refresh(); }} />;
          })}
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

function SlaCard({
  round, row, companyId, onDone,
}: { round: number; row: SlaRow | undefined; companyId: string; onDone: (m: string) => void }) {
  const [frh, setFrh] = useState(String(row?.first_response_hours ?? (round === 1 ? 2 : round === 2 ? 4 : 8)));
  const [fuh, setFuh] = useState(String(row?.follow_up_hours ?? (round === 1 ? 24 : round === 2 ? 48 : 72)));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const r = await postAdmin('/api/admin/sla', {
      round, first_response_hours: Number(frh), follow_up_hours: Number(fuh), is_active: true, company_id: companyId,
    });
    setBusy(false);
    if (!r.ok) { window.alert(r.error); return; }
    onDone(`Đã lưu SLA vòng ${round}.`);
  };

  return (
    <div className="border border-slate-200 rounded-lg p-3.5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Clock size={14} style={{ color: '#004B9B' }} /> Vòng {round}
      </div>
      <Field label="Liên hệ lần đầu (giờ)"><TextInput type="number" min={0} value={frh} onChange={(e) => setFrh(e.target.value)} /></Field>
      <Field label="Khoảng cách chăm sóc (giờ)"><TextInput type="number" min={0} value={fuh} onChange={(e) => setFuh(e.target.value)} /></Field>
      <PrimaryBtn onClick={save} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu vòng ' + round}</PrimaryBtn>
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
  const [strategy, setStrategy] = useState<'least_loaded' | 'specific_user'>(init?.strategy ?? 'least_loaded');
  const [userId, setUserId] = useState(init?.specific_user_id ?? '');
  const [priority, setPriority] = useState(String(init?.priority ?? (init?.showroom_id ? 10 : 0)));
  const [isActive, setIsActive] = useState(init?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (strategy === 'specific_user' && !userId) { setError('Chọn TVBH cụ thể.'); return; }
    setBusy(true);
    const r = await postAdmin('/api/admin/assignment-rules', {
      op: isNew ? 'create' : 'update',
      id: isNew ? undefined : (target as AssignmentRuleRow).id,
      showroom_id: showroomId || null,
      strategy,
      specific_user_id: strategy === 'specific_user' ? userId : null,
      priority: Number(priority) || 0,
      is_active: isActive,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? null); return; }
    onDone(isNew ? 'Đã thêm luật phân giao.' : 'Đã cập nhật luật.');
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{isNew ? 'Thêm luật phân giao' : 'Sửa luật phân giao'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Phạm vi" hint="Để trống = luật mặc định toàn công ty.">
            <Select value={showroomId} onChange={(e) => setShowroomId(e.target.value)}>
              <option value="">Toàn công ty (mặc định)</option>
              {showrooms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Cách chia">
            <Select value={strategy} onChange={(e) => setStrategy(e.target.value as 'least_loaded' | 'specific_user')}>
              <option value="least_loaded">Luân phiên đều (TVBH ít lead nhất)</option>
              <option value="specific_user">TVBH cố định</option>
            </Select>
          </Field>
          {strategy === 'specific_user' && (
            <Field label="TVBH nhận lead">
              <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">— Chọn TVBH —</option>
                {tvbhList.map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
              </Select>
            </Field>
          )}
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
