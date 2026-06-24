'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Plus, Edit2, Trash2, X, Send } from 'lucide-react';
import type { NotifChannelRow } from './types';
import {
  PanelHeader, PrimaryBtn, GhostBtn, Field, TextInput, Select, Toggle, StatusPill, FlashBar, Panel, postAdmin,
} from './ui';

const EVENT_LABELS: Record<string, string> = {
  new_lead: 'Lead mới',
  overdue: 'Lead quá hạn',
  status_change: 'Đổi trạng thái',
};
const ALL_EVENTS = Object.keys(EVENT_LABELS);

export default function NotificationsManager({ channels }: { channels: NotifChannelRow[] }) {
  const router = useRouter();
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };
  const [edit, setEdit] = useState<NotifChannelRow | 'new' | null>(null);

  const del = async (c: NotifChannelRow) => {
    if (!window.confirm(`Xoá kênh thông báo "${c.name}"?`)) return;
    const r = await postAdmin('/api/admin/notification-channels', { op: 'delete', id: c.id });
    if (!r.ok) { window.alert(r.error); return; }
    flashMsg('Đã xoá kênh thông báo.'); router.refresh();
  };

  return (
    <div className="space-y-4">
      <FlashBar msg={flash} />
      <Panel>
        <PanelHeader
          title="Kênh thông báo"
          desc="Khi có sự kiện (lead mới, quá hạn…), hệ thống đẩy thông báo vào các kênh Zalo / Telegram được bật ở đây."
          action={<PrimaryBtn onClick={() => setEdit('new')}><Plus size={15} /> Thêm kênh</PrimaryBtn>}
        />
        <div className="space-y-2">
          {channels.map((c) => (
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
                    {c.target && <span className="font-mono">· {c.target}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusPill active={c.is_active} />
                <IconBtn title="Sửa" onClick={() => setEdit(c)}><Edit2 size={14} style={{ color: '#004B9B' }} /></IconBtn>
                <IconBtn title="Xoá" onClick={() => del(c)}><Trash2 size={14} className="text-rose-600" /></IconBtn>
              </div>
            </div>
          ))}
          {channels.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">Chưa có kênh thông báo.</p>}
        </div>
      </Panel>

      {edit && (
        <NotifModal target={edit}
          onClose={() => setEdit(null)}
          onDone={(m) => { setEdit(null); flashMsg(m); router.refresh(); }} />
      )}
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

function NotifModal({ target, onClose, onDone }: { target: NotifChannelRow | 'new'; onClose: () => void; onDone: (m: string) => void }) {
  const isNew = target === 'new';
  const init = isNew ? null : target;
  const [channel, setChannel] = useState<'zalo' | 'telegram'>(init?.channel ?? 'zalo');
  const [name, setName] = useState(init?.name ?? '');
  const [tgt, setTgt] = useState(init?.target ?? '');
  const [events, setEvents] = useState<string[]>(init?.events ?? ['new_lead']);
  const [isActive, setIsActive] = useState(init?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleEvent = (e: string) =>
    setEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError('Nhập tên kênh.'); return; }
    if (events.length === 0) { setError('Chọn ít nhất 1 sự kiện.'); return; }
    setBusy(true);
    const r = await postAdmin('/api/admin/notification-channels', {
      op: isNew ? 'create' : 'update',
      id: isNew ? undefined : (target as NotifChannelRow).id,
      channel, name: name.trim(), target: tgt.trim() || null, events, is_active: isActive,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? null); return; }
    onDone(isNew ? `Đã thêm kênh "${name.trim()}".` : `Đã cập nhật "${name.trim()}".`);
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{isNew ? 'Thêm kênh thông báo' : 'Sửa kênh thông báo'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Loại kênh">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as 'zalo' | 'telegram')}>
              <option value="zalo">Zalo</option>
              <option value="telegram">Telegram</option>
            </Select>
          </Field>
          <Field label="Tên hiển thị"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Nhóm CSKH KIA Hà Nội" /></Field>
          <Field label="Đích gửi (group/chat id)" hint="ID nhóm Zalo hoặc chat_id Telegram nhận thông báo.">
            <TextInput value={tgt} onChange={(e) => setTgt(e.target.value)} placeholder="-1001234567890" />
          </Field>
          <Field label="Kích hoạt khi">
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map((e) => {
                const on = events.includes(e);
                return (
                  <button key={e} type="button" onClick={() => toggleEvent(e)}
                    className="text-xs font-medium rounded-full px-3 py-1.5 border transition-colors"
                    style={on
                      ? { background: '#e6f0fa', borderColor: '#004B9B', color: '#004B9B' }
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
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
          <GhostBtn onClick={onClose} disabled={busy}>Hủy</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}
