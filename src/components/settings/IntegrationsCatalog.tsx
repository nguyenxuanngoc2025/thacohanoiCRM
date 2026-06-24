'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Megaphone, Globe, MessageCircle, Search, Music2, Phone, Mail, MessagesSquare, Store,
  ChevronDown, Plus, Edit2, Trash2, X,
} from 'lucide-react';
import type { ChannelRow, ShowroomRow, BrandRow } from './types';
import {
  PrimaryBtn, GhostBtn, Field, TextInput, Select, Toggle, StatusPill, FlashBar, postAdmin,
} from './ui';

export type { ChannelRow };

type ConnectorState = 'active' | 'soon';
interface Connector { key: string; name: string; desc: string; icon: React.ElementType; color: string; state: ConnectorState; unit: string; }

// Danh mục kênh — thêm kênh = thêm 1 dòng. 'unit' = đơn vị đăng ký (trang/biểu mẫu).
const CONNECTORS: Connector[] = [
  { key: 'facebook', name: 'Facebook',          desc: 'Lead Ads · Messenger · bình luận',     icon: Megaphone,      color: '#1877F2', state: 'active', unit: 'fanpage' },
  { key: 'website',  name: 'Website form',       desc: 'Form trên web · landing page',         icon: Globe,          color: '#004B9B', state: 'active', unit: 'biểu mẫu' },
  { key: 'zalo',     name: 'Zalo OA',            desc: 'Official Account · ZNS',               icon: MessageCircle,  color: '#0068FF', state: 'soon',   unit: 'OA' },
  { key: 'google',   name: 'Google form / Ads',  desc: 'Lead form Google Ads · Google Form',   icon: Search,         color: '#EA4335', state: 'soon',   unit: 'form' },
  { key: 'tiktok',   name: 'TikTok Lead',        desc: 'TikTok Lead Generation',               icon: Music2,         color: '#010101', state: 'soon',   unit: 'form' },
  { key: 'hotline',  name: 'Hotline / Tổng đài', desc: 'Cuộc gọi đến · ghi nhận lead',         icon: Phone,          color: '#16a34a', state: 'soon',   unit: 'số' },
  { key: 'email',    name: 'Email',              desc: 'Hộp thư thu lead',                     icon: Mail,           color: '#0EA5E9', state: 'soon',   unit: 'hộp thư' },
  { key: 'livechat', name: 'Live chat',          desc: 'Chat trực tuyến trên web',             icon: MessagesSquare, color: '#8B5CF6', state: 'soon',   unit: 'widget' },
  { key: 'walkin',   name: 'Khách tới showroom', desc: 'Khách vãng lai · ghi nhận tại quầy',   icon: Store,          color: '#F59E0B', state: 'soon',   unit: 'điểm' },
];

export default function IntegrationsCatalog({
  channels, showrooms, brands,
}: { channels: ChannelRow[]; showrooms: ShowroomRow[]; brands: BrandRow[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [modal, setModal] = useState<{ platform: string; row: ChannelRow | 'new' } | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };

  const byPlatform = useMemo(() => {
    const m: Record<string, ChannelRow[]> = {};
    for (const c of channels) {
      const p = (c.platform ?? '').toLowerCase();
      (m[p] ??= []).push(c);
    }
    return m;
  }, [channels]);

  const del = async (c: ChannelRow) => {
    if (!window.confirm(`Xoá đăng ký "${c.page_name ?? c.page_id}"? Lead cũ vẫn giữ, lead mới từ nguồn này sẽ không vào được.`)) return;
    const r = await postAdmin('/api/admin/channels', { op: 'delete', id: c.id });
    if (!r.ok) { window.alert(r.error); return; }
    flashMsg('Đã xoá đăng ký kênh.'); router.refresh();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Tích hợp &amp; Nguồn lead</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Mọi kênh đổ về một cửa nạp lead chung. Mỗi trang/biểu mẫu gán: nguồn → showroom · thương hiệu · chiến dịch.
        </p>
      </div>

      <FlashBar msg={flash} />

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {CONNECTORS.map((conn) => {
          const rows = byPlatform[conn.key] ?? [];
          const count = rows.length;
          const connected = conn.state === 'active' && count > 0;
          const Icon = conn.icon;
          const isOpen = expanded === conn.key;

          return (
            <div key={conn.key}
              className="rounded-xl border bg-white shadow-sm overflow-hidden transition-colors"
              style={{ borderColor: isOpen ? '#004B9B' : '#e2e8f0', opacity: conn.state === 'soon' ? 0.7 : 1, gridColumn: isOpen ? '1 / -1' : undefined }}>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${conn.color}14` }}>
                    <Icon size={20} style={{ color: conn.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900">{conn.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{conn.desc}</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <StatusBadge state={conn.state} connected={connected} count={count} unit={conn.unit} />
                  {conn.state === 'active' ? (
                    <button
                      onClick={() => setExpanded(isOpen ? null : conn.key)}
                      className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 transition-colors"
                      style={{ color: '#004B9B' }}>
                      {connected ? 'Cấu hình' : 'Kết nối'}
                      <ChevronDown size={13} style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                    </button>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-400">Sắp có</span>
                  )}
                </div>
              </div>

              {isOpen && conn.state === 'active' && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {count} {conn.unit} đã đăng ký
                    </div>
                    <PrimaryBtn onClick={() => setModal({ platform: conn.key, row: 'new' })}>
                      <Plus size={13} /> Thêm {conn.unit}
                    </PrimaryBtn>
                  </div>
                  <div className="space-y-1.5">
                    {rows.map((c) => (
                      <ChannelItem key={c.id} c={c} showrooms={showrooms} brands={brands}
                        onEdit={() => setModal({ platform: conn.key, row: c })} onDelete={() => del(c)} />
                    ))}
                    {count === 0 && <div className="text-xs text-slate-400 py-3 text-center">Chưa có {conn.unit} nào. Bấm “Thêm {conn.unit}”.</div>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modal && (
        <ChannelModal platform={modal.platform} target={modal.row} showrooms={showrooms} brands={brands}
          unit={CONNECTORS.find((c) => c.key === modal.platform)?.unit ?? 'trang'}
          onClose={() => setModal(null)}
          onDone={(m) => { setModal(null); flashMsg(m); router.refresh(); }} />
      )}
    </div>
  );
}

function ChannelItem({
  c, showrooms, brands, onEdit, onDelete,
}: { c: ChannelRow; showrooms: ShowroomRow[]; brands: BrandRow[]; onEdit: () => void; onDelete: () => void }) {
  const sr = showrooms.find((s) => s.id === c.showroom_id)?.name ?? '—';
  const br = brands.find((b) => b.id === c.brand_id)?.name ?? '—';
  return (
    <div className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded-lg px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="font-medium text-slate-800 truncate">{c.page_name ?? '—'}</div>
        <div className="text-[10px] text-slate-400 flex flex-wrap gap-1.5 mt-0.5">
          {c.page_id && <span className="font-mono">{c.page_id}</span>}
          <span>· {sr}</span>
          <span>· {br}</span>
          {c.campaign && <span>· {c.campaign}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        <StatusPill active={c.is_active} />
        <button title="Sửa" onClick={onEdit} className="w-6 h-6 inline-flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50">
          <Edit2 size={12} style={{ color: '#004B9B' }} />
        </button>
        <button title="Xoá" onClick={onDelete} className="w-6 h-6 inline-flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50">
          <Trash2 size={12} className="text-rose-600" />
        </button>
      </div>
    </div>
  );
}

function ChannelModal({
  platform, target, showrooms, brands, unit, onClose, onDone,
}: {
  platform: string; target: ChannelRow | 'new';
  showrooms: ShowroomRow[]; brands: BrandRow[]; unit: string;
  onClose: () => void; onDone: (m: string) => void;
}) {
  const isNew = target === 'new';
  const init = isNew ? null : target;
  const [pageId, setPageId] = useState(init?.page_id ?? '');
  const [pageName, setPageName] = useState(init?.page_name ?? '');
  const [showroomId, setShowroomId] = useState(init?.showroom_id ?? '');
  const [brandId, setBrandId] = useState(init?.brand_id ?? '');
  const [campaign, setCampaign] = useState(init?.campaign ?? '');
  const [isActive, setIsActive] = useState(init?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFb = platform === 'facebook';
  const idLabel = isFb ? 'Page ID (Fanpage)' : 'Mã biểu mẫu / form key';

  const submit = async () => {
    setError(null);
    if (!pageId.trim()) { setError(`Nhập ${idLabel}.`); return; }
    if (!showroomId) { setError('Chọn showroom.'); return; }
    if (!brandId) { setError('Chọn thương hiệu.'); return; }
    setBusy(true);
    const r = await postAdmin('/api/admin/channels', {
      op: isNew ? 'create' : 'update',
      id: isNew ? undefined : (target as ChannelRow).id,
      platform,
      page_id: pageId.trim(),
      page_name: pageName.trim() || null,
      showroom_id: showroomId, brand_id: brandId,
      campaign: campaign.trim() || null,
      is_active: isActive,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? null); return; }
    onDone(isNew ? `Đã kết nối ${unit} mới.` : 'Đã cập nhật đăng ký kênh.');
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{isNew ? `Thêm ${unit}` : `Sửa ${unit}`}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label={idLabel} hint={isFb ? 'Lấy từ Meta: ID dạng số của fanpage.' : 'Khoá định danh form gửi kèm khi submit.'}>
            <TextInput value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder={isFb ? '1234567890' : 'form-landing-kia'} disabled={!isNew} />
          </Field>
          <Field label="Tên hiển thị"><TextInput value={pageName} onChange={(e) => setPageName(e.target.value)} placeholder={isFb ? 'KIA Hà Nội Official' : 'Landing KIA Sonet'} /></Field>
          <Field label="Showroom nhận lead">
            <Select value={showroomId} onChange={(e) => setShowroomId(e.target.value)}>
              <option value="">— Chọn showroom —</option>
              {showrooms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Thương hiệu">
            <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">— Chọn thương hiệu —</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Chiến dịch (tuỳ chọn)" hint="Gắn nhãn nguồn để báo cáo theo chiến dịch quảng cáo.">
            <TextInput value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Tết 2026" />
          </Field>
          <Toggle checked={isActive} onChange={setIsActive} label="Đang nhận lead" />
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

function StatusBadge({ state, connected, count, unit }: { state: ConnectorState; connected: boolean; count: number; unit: string }) {
  if (state === 'soon') return <Dot color="#cbd5e1" label="Chưa khả dụng" textColor="#94a3b8" />;
  if (connected) return <Dot color="#10b981" label={`${count} ${unit} · đang chạy`} textColor="#047857" />;
  return <Dot color="#cbd5e1" label="Chưa kết nối" textColor="#64748b" />;
}

function Dot({ color, label, textColor }: { color: string; label: string; textColor: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: textColor }}>
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
