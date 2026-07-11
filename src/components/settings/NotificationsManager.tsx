'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Plus, Edit2, Trash2, X, Send, ChevronDown, Search } from 'lucide-react';
import type { NotifChannelRow, ShowroomRow, SalesTeamRow } from './types';
import {
  PanelHeader, PrimaryBtn, GhostBtn, Field, TextInput, Select, Toggle, StatusPill, FlashBar, Panel, postAdmin,
} from './ui';
import GroupPicker from './GroupPicker';
import ZaloBotConnect from './ZaloBotConnect';
import { useDialogs } from '@/components/ui/dialogs';

const EVENT_LABELS: Record<string, string> = {
  new_lead: 'Data mới',
  overdue: 'Nhắc quá hạn',
  daily_report: 'Báo cáo ngày',
  weekly_report: 'Báo cáo tuần',
  monthly_report: 'Báo cáo tháng',
};
// Sự kiện hợp lệ theo loại nhóm: nhóm bán hàng nhận lead/quá hạn/ngày; nhóm BLĐ nhận ngày/tuần/tháng.
const SALES_EVENTS = ['new_lead', 'overdue', 'daily_report'];
const MGMT_EVENTS = ['daily_report', 'weekly_report', 'monthly_report'];

type Scope = 'sales' | 'management';

export default function NotificationsManager(
  { channels, showrooms, salesTeams, zaloBotSession }: {
    channels: NotifChannelRow[]; showrooms: ShowroomRow[]; salesTeams: SalesTeamRow[];
    zaloBotSession: { status: 'connected' | 'disconnected'; displayName: string | null; lastError: string | null };
  },
) {
  const router = useRouter();
  const { alert, dialog } = useDialogs();
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };
  const [edit, setEdit] = useState<NotifChannelRow | 'new' | null>(null);
  // Xoá kênh: dùng modal xác nhận trong app thay vì window.confirm native (khớp giao diện).
  const [confirmDel, setConfirmDel] = useState<NotifChannelRow | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  const srName = (id: string | null) => showrooms.find((s) => s.id === id)?.name ?? null;
  // Nhãn phòng: "<showroom> · <tên phòng>" để phân biệt phòng cùng tên ở showroom khác.
  const teamLabel = (id: string | null) => {
    const t = salesTeams.find((x) => x.id === id);
    if (!t) return 'Chưa gán phòng';
    const sr = srName(t.showroom_id);
    return sr ? `${sr} · ${t.name}` : t.name;
  };
  // Nhãn kênh nhiều phòng: liệt kê tên các phòng đã chọn.
  const teamsLabel = (ids: string[]) => {
    if (!ids || ids.length === 0) return 'Chưa gán phòng';
    const names = ids.map((id) => salesTeams.find((x) => x.id === id)?.name).filter(Boolean);
    return names.length ? names.join(', ') : 'Chưa gán phòng';
  };

  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  // Section thu gọn được (key = showroom/company/orphan). Mặc định mở hết.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setCollapsed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // Nhóm kênh theo showroom để dễ tìm/quản lý khi có nhiều showroom × nhiều group.
  const grouped = useMemo(() => {
    const match = (c: NotifChannelRow) =>
      !q || c.name.toLowerCase().includes(q) || (c.target ?? '').toLowerCase().includes(q);
    const srOf = (c: NotifChannelRow): string | null => {
      if (c.scope !== 'sales') return c.showroom_id ?? null;
      const first = (c.sales_team_ids && c.sales_team_ids[0]) || c.sales_team_id || null;
      return first ? (salesTeams.find((t) => t.id === first)?.showroom_id ?? null) : null;
    };
    const list = channels.filter(match);
    const byShowroom = showrooms
      .map((sr) => ({
        id: sr.id,
        name: sr.name,
        sales: list.filter((c) => c.scope === 'sales' && srOf(c) === sr.id),
        mgmt: list.filter((c) => c.scope === 'management' && c.showroom_id === sr.id),
      }))
      .filter((g) => g.sales.length + g.mgmt.length > 0);
    const companyMgmt = list.filter((c) => c.scope === 'management' && !c.showroom_id);
    const orphanSales = list.filter((c) => c.scope === 'sales' && !srOf(c));
    return { byShowroom, companyMgmt, orphanSales };
  }, [channels, showrooms, salesTeams, q]);

  const isEmpty =
    grouped.byShowroom.length === 0 && grouped.companyMgmt.length === 0 && grouped.orphanSales.length === 0;

  const doDelete = async () => {
    if (!confirmDel) return;
    setDelBusy(true); setDelError(null);
    const r = await postAdmin('/api/admin/notification-channels', { op: 'delete', id: confirmDel.id });
    setDelBusy(false);
    if (!r.ok) { setDelError(r.error ?? 'Xoá kênh thất bại.'); return; }
    setConfirmDel(null);
    flashMsg('Đã xoá kênh thông báo.'); router.refresh();
  };

  const sendTest = async (c: NotifChannelRow) => {
    const r = await postAdmin('/api/admin/notification-channels', { op: 'test', id: c.id });
    if (!r.ok) { await alert({ title: 'Gửi thử thất bại', message: r.error }); return; }
    flashMsg(`Đã xếp hàng tin thử vào "${c.name}". Kiểm tra nhóm Zalo sau ít giây.`);
  };

  const row = (c: NotifChannelRow) => (
    <div key={c.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: c.channel === 'telegram' ? '#229ED914' : '#0068FF14' }}>
          {c.channel === 'telegram'
            ? <Send size={16} style={{ color: '#229ED9' }} />
            : <Bell size={16} style={{ color: '#0068FF' }} />}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-slate-800 truncate">
            {c.name} <span className="text-[10px] uppercase font-bold text-slate-400 ml-1">{c.channel}</span>
          </div>
          <div className="text-[11px] text-slate-400 flex flex-wrap gap-1 mt-0.5">
            {(c.events ?? []).map((e) => (
              <span key={e} className="bg-slate-100 rounded px-1.5 py-0.5">{EVENT_LABELS[e] ?? e}</span>
            ))}
            <span className="bg-slate-100 rounded px-1.5 py-0.5">
              {c.scope === 'management'
                ? (c.showroom_id ? `BLĐ ${srName(c.showroom_id) ?? ''}` : 'BLĐ toàn công ty')
                : teamsLabel(c.sales_team_ids ?? (c.sales_team_id ? [c.sales_team_id] : []))}
            </span>
            {c.target && <span className="font-mono">· {c.target}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusPill active={c.is_active} />
        <IconBtn title="Gửi thử" onClick={() => sendTest(c)}><Send size={14} style={{ color: '#0068FF' }} /></IconBtn>
        <IconBtn title="Sửa" onClick={() => setEdit(c)}><Edit2 size={14} style={{ color: 'var(--color-brand)' }} /></IconBtn>
        <IconBtn title="Xoá" onClick={() => { setDelError(null); setConfirmDel(c); }}><Trash2 size={14} className="text-rose-600" /></IconBtn>
      </div>
    </div>
  );

  // Khối 1 showroom (hoặc nhóm chung): header bấm để thu gọn + đếm số group.
  const section = (key: string, title: string, count: number, children: React.ReactNode) => {
    const open = !collapsed.has(key);
    return (
      <div key={key} className="border border-slate-200 rounded-xl overflow-hidden">
        <button type="button" onClick={() => toggle(key)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors">
          <span className="flex items-center gap-2 font-semibold text-slate-700 text-sm">
            <ChevronDown size={15} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
            {title}
          </span>
          <span className="text-xs text-slate-400">{count} group</span>
        </button>
        {open && <div className="p-3 space-y-2">{children}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {dialog}
      <FlashBar msg={flash} />
      <Panel>
        <PanelHeader
          title="Bot gửi thông báo"
          desc="Đăng nhập 1 tài khoản Zalo để hệ thống dùng làm bot gửi tin lead mới và báo cáo vào các group bên dưới. Quét mã QR như đăng nhập Zalo trên máy tính."
        />
        <ZaloBotConnect session={zaloBotSession} />
      </Panel>

      <Panel>
        <PanelHeader
          title="Kênh thông báo"
          desc="Mỗi PHÒNG BÁN HÀNG có 1 group Zalo riêng (lead mới + nhắc quá hạn + báo cáo ngày của phòng). Nhóm Ban lãnh đạo nhận báo cáo ngày/tuần/tháng theo showroom hoặc toàn công ty."
          action={<PrimaryBtn onClick={() => setEdit('new')}><Plus size={15} /> Thêm kênh</PrimaryBtn>}
        />

        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <TextInput className="pl-9" placeholder="Tìm group theo tên hoặc mã…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="space-y-3">
          {grouped.byShowroom.map((g) => section(`sr:${g.id}`, g.name, g.sales.length + g.mgmt.length, (
            <>
              {g.sales.length > 0 && <SubLabel>Bán hàng (theo phòng)</SubLabel>}
              {g.sales.map(row)}
              {g.mgmt.length > 0 && <SubLabel>Ban lãnh đạo showroom</SubLabel>}
              {g.mgmt.map(row)}
            </>
          )))}
          {grouped.companyMgmt.length > 0 &&
            section('company', 'Ban lãnh đạo — toàn công ty', grouped.companyMgmt.length, grouped.companyMgmt.map(row))}
          {grouped.orphanSales.length > 0 &&
            section('orphan', 'Chưa gán showroom', grouped.orphanSales.length, grouped.orphanSales.map(row))}
          {isEmpty && (
            <p className="text-sm text-slate-400 py-6 text-center">
              {q ? 'Không tìm thấy group khớp.' : 'Chưa có kênh thông báo nào.'}
            </p>
          )}
        </div>
      </Panel>

      {edit && (
        <NotifModal target={edit} showrooms={showrooms} salesTeams={salesTeams}
          srName={srName} teamLabel={teamLabel}
          onClose={() => setEdit(null)}
          onDone={(m) => { setEdit(null); flashMsg(m); router.refresh(); }} />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!delBusy) setConfirmDel(null); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Xoá kênh thông báo</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-slate-600">
                Bạn có chắc muốn xoá kênh <span className="font-semibold text-slate-900">{confirmDel.name}</span>?
                Group Zalo/Telegram này sẽ ngừng nhận thông báo.
              </p>
              {delError && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{delError}</div>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
              <GhostBtn onClick={() => setConfirmDel(null)} disabled={delBusy}>Hủy</GhostBtn>
              <button onClick={doDelete} disabled={delBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors">
                <Trash2 size={14} /> {delBusy ? 'Đang xoá...' : 'Xoá kênh'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 pt-1 first:pt-0">{children}</div>;
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick}
      className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50 transition-colors">
      {children}
    </button>
  );
}

function NotifModal(
  { target, showrooms, salesTeams, srName, teamLabel, onClose, onDone }: {
    target: NotifChannelRow | 'new';
    showrooms: ShowroomRow[];
    salesTeams: SalesTeamRow[];
    srName: (id: string | null) => string | null;
    teamLabel: (id: string | null) => string;
    onClose: () => void;
    onDone: (m: string) => void;
  },
) {
  const isNew = target === 'new';
  const init = isNew ? null : target;
  const [channel, setChannel] = useState<'zalo' | 'telegram'>(init?.channel ?? 'zalo');
  const [name, setName] = useState(init?.name ?? '');
  const [tgt, setTgt] = useState(init?.target ?? '');
  const [scope, setScope] = useState<Scope>(init?.scope ?? 'sales');
  const [events, setEvents] = useState<string[]>(init?.events ?? ['new_lead', 'overdue', 'daily_report']);
  const [isActive, setIsActive] = useState(init?.is_active ?? true);
  const [salesTeamIds, setSalesTeamIds] = useState<string[]>(
    init?.sales_team_ids?.length ? init.sales_team_ids : (init?.sales_team_id ? [init.sales_team_id] : []),
  );
  const [showroomId, setShowroomId] = useState<string>(init?.showroom_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedEvents = scope === 'sales' ? SALES_EVENTS : MGMT_EVENTS;

  // Khi đổi loại nhóm: lọc lại sự kiện cho hợp lệ + đặt mặc định nếu trống.
  const changeScope = (s: Scope) => {
    setScope(s);
    const allowed = s === 'sales' ? SALES_EVENTS : MGMT_EVENTS;
    setEvents((prev) => {
      const kept = prev.filter((e) => allowed.includes(e));
      return kept.length ? kept : (s === 'sales' ? ['new_lead', 'overdue', 'daily_report'] : ['daily_report']);
    });
  };

  const toggleEvent = (e: string) =>
    setEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);
  const toggleTeam = (id: string) =>
    setSalesTeamIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError('Nhập tên kênh.'); return; }
    if (events.length === 0) { setError('Chọn ít nhất 1 sự kiện.'); return; }
    if (scope === 'sales' && salesTeamIds.length === 0) { setError('Chọn ít nhất 1 phòng bán hàng.'); return; }
    setBusy(true);
    const r = await postAdmin('/api/admin/notification-channels', {
      op: isNew ? 'create' : 'update',
      id: isNew ? undefined : (target as NotifChannelRow).id,
      channel, name: name.trim(), target: tgt.trim() || null, events, is_active: isActive,
      scope,
      sales_team_ids: scope === 'sales' ? salesTeamIds : [],
      showroom_id: scope === 'management' ? (showroomId || null) : null,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? null); return; }
    onDone(isNew ? `Đã thêm kênh "${name.trim()}".` : `Đã cập nhật "${name.trim()}".`);
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <h3 className="font-bold text-slate-900">{isNew ? 'Thêm kênh thông báo' : 'Sửa kênh thông báo'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <Field label="Loại kênh">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as 'zalo' | 'telegram')}>
              <option value="zalo">Zalo</option>
              <option value="telegram">Telegram</option>
            </Select>
          </Field>
          <Field label="Nhóm thuộc về">
            <Select value={scope} onChange={(e) => changeScope(e.target.value as Scope)}>
              <option value="sales">Phòng bán hàng (lead + quá hạn + báo cáo ngày)</option>
              <option value="management">Ban lãnh đạo (báo cáo ngày/tuần/tháng)</option>
            </Select>
          </Field>
          {scope === 'sales' && (
            <Field label="Phòng bán hàng nhận thông báo" hint="Chọn 1 hoặc nhiều phòng cùng gửi về group này.">
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {salesTeams.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">Chưa có phòng bán hàng.</div>}
                {salesTeams.map((t) => {
                  const on = salesTeamIds.includes(t.id);
                  return (
                    <label key={t.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={on} onChange={() => toggleTeam(t.id)}
                        className="w-4 h-4 rounded border-slate-300" style={{ accentColor: 'var(--color-brand)' }} />
                      <span className="text-sm text-slate-700">{teamLabel(t.id)}</span>
                    </label>
                  );
                })}
              </div>
            </Field>
          )}
          {scope === 'management' && (
            <Field label="Phạm vi báo cáo" hint="Để trống = báo cáo tổng hợp toàn công ty cho BLĐ.">
              <Select value={showroomId} onChange={(e) => setShowroomId(e.target.value)}>
                <option value="">Toàn công ty (BLĐ)</option>
                {showrooms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Tên hiển thị"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Group Phòng KIA 1" /></Field>
          {channel === 'zalo' ? (
            <Field label="Group Zalo nhận thông báo" hint="Chọn từ các group con bot đang tham gia. Bấm làm mới nếu vừa thêm bot vào group mới.">
              <GroupPicker value={tgt} onChange={setTgt} />
            </Field>
          ) : (
            <Field label="Chat ID Telegram" hint="chat_id của nhóm/kênh Telegram nhận thông báo.">
              <TextInput value={tgt} onChange={(e) => setTgt(e.target.value)} placeholder="-1001234567890" />
            </Field>
          )}
          <Field label="Kích hoạt khi">
            <div className="flex flex-wrap gap-2">
              {allowedEvents.map((e) => {
                const on = events.includes(e);
                return (
                  <button key={e} type="button" onClick={() => toggleEvent(e)}
                    className="text-xs font-medium rounded-full px-3 py-1.5 border transition-colors"
                    style={on
                      ? { background: '#e6f0fa', borderColor: 'var(--color-brand)', color: 'var(--color-brand)' }
                      : { borderColor: '#e2e8f0', color: '#64748b' }}>
                    {EVENT_LABELS[e]}
                  </button>
                );
              })}
            </div>
          </Field>
          <Toggle checked={isActive} onChange={setIsActive} label="Kênh đang hoạt động" />
          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100 shrink-0">
          <GhostBtn onClick={onClose} disabled={busy}>Hủy</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}
