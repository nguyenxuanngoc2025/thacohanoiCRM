'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch, Plus, Edit2, Trash2, X, Clock, Layers, Bell } from 'lucide-react';
import type { ShowroomRow, AssignmentRuleRow, SlaRow, AssignStrategy } from './types';
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
  showrooms, staff, rules, sla, companyId, companyShowroomStrategy,
}: {
  showrooms: ShowroomRow[];
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

      {/* Nguyên tắc phân giao + kiểu chia vào showroom */}
      <Panel>
        <PanelHeader
          title="Nguyên tắc phân giao lead"
          desc="Mỗi lead mới đi qua 3 cấp. Mỗi cấp tự chọn 1 trong 3 kiểu chia."
        />
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-4 space-y-3 text-sm text-slate-600">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 w-5 h-5 shrink-0 inline-flex items-center justify-center rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700">1</span>
            <p><span className="font-semibold text-slate-800">Vào showroom</span> — lead mới được chọn về 1 showroom (theo kiểu chia đặt ngay bên dưới).</p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 w-5 h-5 shrink-0 inline-flex items-center justify-center rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700">2</span>
            <p><span className="font-semibold text-slate-800">Vào phòng bán hàng</span> — trong showroom, lead được chia về 1 phòng (kiểu chia đặt tại từng showroom).</p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 w-5 h-5 shrink-0 inline-flex items-center justify-center rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700">3</span>
            <p><span className="font-semibold text-slate-800">Cho TVBH</span> — trong phòng, lead được giao cho 1 tư vấn bán hàng (kiểu chia đặt tại từng phòng).</p>
          </div>
          <div className="pt-2 border-t border-slate-200 text-[13px] leading-relaxed">
            <span className="font-semibold text-slate-800">3 kiểu chia:</span>{' '}
            <b>Ít lead nhất</b> (ưu tiên nơi đang giữ ít lead chờ nhất) ·{' '}
            <b>Xoay vòng</b> (nơi lâu nhất chưa nhận thì tới lượt) ·{' '}
            <b>Theo tỷ lệ %</b> (mỗi nơi một phần trăm, tổng 100%, ai đang thiếu so với tỷ lệ thì nhận).
          </div>
        </div>

        <div className="mt-4">
          <CompanyStrategyPanel
            companyId={companyId}
            initial={companyShowroomStrategy}
            showrooms={showrooms}
            onDone={(m) => { flashMsg(m); router.refresh(); }}
          />
        </div>
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
          desc="Luật ghi đè: ghim toàn bộ lead của 1 showroom về 1 TVBH cố định (ưu tiên cao hơn 3 cấp ở trên)."
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
              {rules.map((r) => (
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
              {rules.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Chưa có luật ghim — lead chia theo 3 cấp ở trên.</td></tr>
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

// Kiểu chia "vào showroom" (mức công ty). Khi chọn Theo tỷ lệ → nhập % từng showroom.
function CompanyStrategyPanel({
  companyId, initial, showrooms, onDone,
}: { companyId: string; initial: AssignStrategy; showrooms: ShowroomRow[]; onDone: (m: string) => void }) {
  const [strategy, setStrategy] = useState<AssignStrategy>(initial);
  const [busy, setBusy] = useState(false);

  const saveStrategy = async (next: AssignStrategy) => {
    setStrategy(next);
    setBusy(true);
    const r = await postAdmin('/api/admin/assignment-rules', { op: 'set-company-strategy', showroom_assign_strategy: next });
    setBusy(false);
    if (!r.ok) { window.alert(r.error); setStrategy(initial); return; }
    onDone('Đã đổi kiểu chia vào showroom.');
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Layers size={15} style={{ color: '#004B9B' }} /> Kiểu chia lead vào showroom
      </div>
      <Field label="Cấp công ty → showroom" hint="Áp dụng khi công ty có nhiều showroom.">
        <Select value={strategy} disabled={busy} onChange={(e) => saveStrategy(e.target.value as AssignStrategy)}>
          <option value="least_loaded">{STRATEGY_LABELS.least_loaded}</option>
          <option value="round_robin">{STRATEGY_LABELS.round_robin}</option>
          <option value="weighted">{STRATEGY_LABELS.weighted}</option>
        </Select>
      </Field>
      {strategy === 'weighted' && (
        <ShowroomShareList showrooms={showrooms} onDone={onDone} />
      )}
    </div>
  );
}

// Danh sách % share từng showroom (chỉ hiện khi công ty chọn Theo tỷ lệ).
function ShowroomShareList({ showrooms, onDone }: { showrooms: ShowroomRow[]; onDone: (m: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(showrooms.map((s) => [s.id, String(s.assign_share_pct ?? 0)])),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const total = showrooms.reduce((acc, s) => acc + (Number(vals[s.id]) || 0), 0);

  const save = async (s: ShowroomRow) => {
    setBusyId(s.id);
    const r = await postAdmin('/api/admin/showrooms', {
      op: 'update', id: s.id, name: s.name, code: s.code, brand_ids: s.brand_ids,
      assign_share_pct: Number(vals[s.id]) || 0,
    });
    setBusyId(null);
    if (!r.ok) { window.alert(r.error); return; }
    onDone(`Đã lưu tỷ lệ showroom ${s.name}.`);
  };

  return (
    <div className="space-y-2 pt-1">
      <div className="text-xs text-slate-500">
        Nhập phần trăm cho từng showroom. Tổng hiện tại:{' '}
        <span className={total === 100 ? 'font-bold text-emerald-600' : 'font-bold text-amber-600'}>{total}%</span>
        {total !== 100 && ' (nên bằng 100%)'}
      </div>
      {showrooms.map((s) => (
        <div key={s.id} className="flex items-center gap-2">
          <span className="flex-1 text-sm text-slate-700 truncate">{s.name}</span>
          <div className="w-24">
            <TextInput type="number" min={0} value={vals[s.id] ?? '0'}
              onChange={(e) => setVals((v) => ({ ...v, [s.id]: e.target.value }))} />
          </div>
          <GhostBtn onClick={() => save(s)} disabled={busyId === s.id}>{busyId === s.id ? '...' : 'Lưu'}</GhostBtn>
        </div>
      ))}
      {showrooms.length === 0 && <div className="text-sm text-slate-400">Chưa có showroom.</div>}
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
