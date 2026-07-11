'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, Plus, Edit2, Trash2, X, HelpCircle,
  Activity, Loader2, CheckCircle2, AlertTriangle, XCircle,
} from 'lucide-react';
import type { ChannelRow, ShowroomRow, BrandRow, ModelRow, AssignStrategy } from './types';
import { PLATFORMS, type ConnectorState } from '@/lib/platforms';
import {
  PrimaryBtn, GhostBtn, Field, TextInput, Select, Toggle, StatusPill, FlashBar, postAdmin,
} from './ui';
import { useDialogs } from '@/components/ui/dialogs';
import ZaloGuideModal from './ZaloGuideModal';
import FacebookGuideModal from './FacebookGuideModal';
import GoogleSheetConnect from './GoogleSheetConnect';
import GoogleSheetGuideModal from './GoogleSheetGuideModal';

export type { ChannelRow };

// Danh mục kênh dùng chung (xem src/lib/platforms.ts) — sửa nguồn tại một chỗ duy nhất.
const CONNECTORS = PLATFORMS;

interface HealthCheck { label: string; status: 'ok' | 'warn' | 'fail'; detail: string }
interface HealthState {
  name: string;
  loading: boolean;
  ok: boolean | null;
  checks: HealthCheck[];
  error: string | null;
}

export default function IntegrationsCatalog({
  channels, showrooms, brands, models, fbBusinessId, googleConnected,
}: {
  channels: ChannelRow[]; showrooms: ShowroomRow[]; brands: BrandRow[]; models: ModelRow[];
  fbBusinessId?: string; googleConnected?: boolean;
}) {
  const router = useRouter();
  const { confirm, alert, dialog } = useDialogs();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [modal, setModal] = useState<{ platform: string; row: ChannelRow | 'new' } | null>(null);
  const [showZaloGuide, setShowZaloGuide] = useState(false);
  const [showFbGuide, setShowFbGuide] = useState(false);
  const [showGoogleGuide, setShowGoogleGuide] = useState(false);
  const [health, setHealth] = useState<HealthState | null>(null);
  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };

  const runHealth = async (c: ChannelRow) => {
    const name = c.page_name ?? c.page_id ?? 'Kênh';
    setHealth({ name, loading: true, ok: null, checks: [], error: null });
    try {
      const res = await fetch('/api/admin/channels/health', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHealth({ name, loading: false, ok: false, checks: [], error: data.error ?? 'Kiểm tra thất bại.' });
        return;
      }
      setHealth({ name, loading: false, ok: !!data.ok, checks: data.checks ?? [], error: null });
    } catch {
      setHealth({ name, loading: false, ok: false, checks: [], error: 'Lỗi kết nối máy chủ.' });
    }
  };

  const byPlatform = useMemo(() => {
    const m: Record<string, ChannelRow[]> = {};
    for (const c of channels) {
      const p = (c.platform ?? '').toLowerCase();
      (m[p] ??= []).push(c);
    }
    return m;
  }, [channels]);

  const del = async (c: ChannelRow) => {
    if (!(await confirm({
      title: 'Xoá đăng ký kênh',
      message: `Xoá đăng ký "${c.page_name ?? c.page_id}"? Lead cũ vẫn giữ, lead mới từ nguồn này sẽ không vào được.`,
      danger: true, confirmText: 'Xoá',
    }))) return;
    const r = await postAdmin('/api/admin/channels', { op: 'delete', id: c.id });
    if (!r.ok) { await alert({ title: 'Không xoá được', message: r.error }); return; }
    flashMsg('Đã xoá đăng ký kênh.'); router.refresh();
  };

  return (
    <div className="space-y-4">
      {dialog}
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
                    <div className="flex items-center gap-2">
                      {(conn.key === 'zalo' || conn.key === 'facebook' || conn.key === 'google_sheet') && (
                        <button
                          onClick={() => {
                            if (conn.key === 'zalo') setShowZaloGuide(true);
                            else if (conn.key === 'facebook') setShowFbGuide(true);
                            else setShowGoogleGuide(true);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                          style={{ color: conn.color }}>
                          <HelpCircle size={13} /> Xem hướng dẫn
                        </button>
                      )}
                      {conn.key !== 'google_sheet' && (
                        <PrimaryBtn onClick={() => setModal({ platform: conn.key, row: 'new' })}>
                          <Plus size={13} /> Thêm {conn.unit}
                        </PrimaryBtn>
                      )}
                    </div>
                  </div>
                  {conn.key === 'google_sheet' ? (
                    <GoogleSheetConnect
                      connected={!!googleConnected}
                      showrooms={showrooms}
                      brands={brands}
                      models={models}
                      sheets={channels.filter((c) => c.platform === 'google_sheet')}
                    />
                  ) : (
                    <div className="space-y-1.5">
                      {rows.map((c) => (
                        <ChannelItem key={c.id} c={c} showrooms={showrooms} brands={brands}
                          onEdit={() => setModal({ platform: conn.key, row: c })} onDelete={() => del(c)}
                          onCheck={conn.key === 'facebook' ? () => runHealth(c) : undefined} />
                      ))}
                      {count === 0 && <div className="text-xs text-slate-400 py-3 text-center">Chưa có {conn.unit} nào. Bấm “Thêm {conn.unit}”.</div>}
                    </div>
                  )}
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

      {showZaloGuide && <ZaloGuideModal onClose={() => setShowZaloGuide(false)} />}
      {showFbGuide && <FacebookGuideModal onClose={() => setShowFbGuide(false)} businessId={fbBusinessId} />}
      {showGoogleGuide && <GoogleSheetGuideModal onClose={() => setShowGoogleGuide(false)} />}
      {health && <HealthModal h={health} onClose={() => setHealth(null)} />}
    </div>
  );
}

function HealthModal({ h, onClose }: { h: HealthState; onClose: () => void }) {
  const overall = h.loading ? null : h.error ? false : h.ok;
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 truncate">Kiểm tra trạng thái · {h.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {h.loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4 justify-center">
              <Loader2 size={16} className="animate-spin" /> Đang kiểm tra kết nối với Facebook…
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold"
                style={{
                  background: overall ? '#ecfdf5' : '#fef2f2',
                  color: overall ? '#047857' : '#b91c1c',
                }}>
                {overall ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                {overall ? 'Mọi thứ bình thường — kênh đang nhận lead tốt.' : 'Có vấn đề cần xử lý (xem chi tiết bên dưới).'}
              </div>
              {h.error ? (
                <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{h.error}</div>
              ) : (
                <div className="space-y-1.5">
                  {h.checks.map((c, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm border border-slate-100 rounded-lg px-3 py-2">
                      <CheckIcon status={c.status} />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800">{c.label}</div>
                        <div className="text-xs text-slate-500 leading-snug">{c.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end px-5 py-3.5 border-t border-slate-100">
          <GhostBtn onClick={onClose}>Đóng</GhostBtn>
        </div>
      </div>
    </div>
  );
}

function CheckIcon({ status }: { status: 'ok' | 'warn' | 'fail' }) {
  if (status === 'ok') return <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />;
  if (status === 'warn') return <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />;
  return <XCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />;
}

function ChannelItem({
  c, showrooms, brands, onEdit, onDelete, onCheck,
}: { c: ChannelRow; showrooms: ShowroomRow[]; brands: BrandRow[]; onEdit: () => void; onDelete: () => void; onCheck?: () => void }) {
  const srIds = c.showroom_ids?.length ? c.showroom_ids : (c.showroom_id ? [c.showroom_id] : []);
  const sr = srIds.map((id) => showrooms.find((s) => s.id === id)?.name).filter(Boolean).join(', ') || '—';
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
        {onCheck && (
          <button title="Kiểm tra trạng thái" onClick={onCheck} className="w-6 h-6 inline-flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50">
            <Activity size={12} className="text-emerald-600" />
          </button>
        )}
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
  const [showroomIds, setShowroomIds] = useState<string[]>(
    init?.showroom_ids?.length ? init.showroom_ids : (init?.showroom_id ? [init.showroom_id] : [])
  );
  // CẤP 1 — cách kênh chia lead vào các showroom + % của từng showroom (chỉ dùng khi "theo tỷ lệ %").
  const [showroomStrategy, setShowroomStrategy] = useState<AssignStrategy>(
    (init?.showroom_assign_strategy ?? 'least_loaded') as AssignStrategy
  );
  const [shares, setShares] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(init?.showroom_shares ?? {}).map(([k, v]) => [k, String(v)]))
  );
  const [brandId, setBrandId] = useState(init?.brand_id ?? '');
  const [campaign, setCampaign] = useState(init?.campaign ?? '');
  const [secret, setSecret] = useState('');
  const [isActive, setIsActive] = useState(init?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFb = platform === 'facebook';
  const isZalo = platform === 'zalo';
  const idLabel = isFb
    ? 'Page ID (Fanpage)'
    : isZalo
      ? 'OA ID (Zalo Official Account)'
      : 'Mã biểu mẫu / form key';

  const toggleShowroom = (id: string) =>
    setShowroomIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    setError(null);
    if (!pageId.trim()) { setError(`Nhập ${idLabel}.`); return; }
    if (showroomIds.length === 0) { setError('Chọn ít nhất 1 showroom nhận lead.'); return; }
    if (!brandId) { setError('Chọn thương hiệu.'); return; }
    setBusy(true);
    const r = await postAdmin('/api/admin/channels', {
      op: isNew ? 'create' : 'update',
      id: isNew ? undefined : (target as ChannelRow).id,
      platform,
      page_id: pageId.trim(),
      page_name: pageName.trim() || null,
      showroom_ids: showroomIds, brand_id: brandId,
      showroom_assign_strategy: showroomStrategy,
      showroom_shares: Object.fromEntries(showroomIds.map((id) => [id, Number(shares[id]) || 0])),
      campaign: campaign.trim() || null,
      ...(isZalo && secret.trim() ? { secret: secret.trim() } : {}),
      is_active: isActive,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? null); return; }
    const base = isNew ? `Đã kết nối ${unit} mới.` : 'Đã cập nhật đăng ký kênh.';
    if (isFb && r.subscribe_error) {
      onDone(`${base} ⚠ Webhook chưa tự đăng ký được: ${r.subscribe_error}`);
    } else if (isFb) {
      onDone(`${base} Đã tự đăng ký webhook — lead sẽ về tự động.`);
    } else if (isZalo) {
      onDone(`${base} Nhớ trỏ Webhook URL trong Zalo Developers về /api/webhook/zalo để nhận lead.`);
    } else {
      onDone(base);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{isNew ? `Thêm ${unit}` : `Sửa ${unit}`}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label={idLabel} hint={isFb ? 'Lấy từ Meta: ID dạng số của fanpage.' : isZalo ? 'OA ID lấy trong Zalo Official Account Manager.' : 'Khoá định danh form gửi kèm khi submit.'}>
            <TextInput value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder={isFb ? '1234567890' : isZalo ? '1234567890123456789' : 'form-landing-kia'} disabled={!isNew} />
          </Field>
          <Field label="Tên hiển thị"><TextInput value={pageName} onChange={(e) => setPageName(e.target.value)} placeholder={isFb ? 'KIA Hà Nội Official' : isZalo ? 'KIA Hà Nội OA' : 'Landing KIA Sonet'} /></Field>
          {isZalo && (
            <Field label="OA Secret Key" hint={isNew ? 'Lấy trong Zalo Developers (App → Official Account) — dùng xác thực chữ ký webhook.' : 'Để trống nếu giữ nguyên secret cũ.'}>
              <TextInput value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={isNew ? 'Dán OA Secret Key' : '••••••••'} />
            </Field>
          )}
          <Field label="Showroom nhận lead" hint="Tick các showroom dùng chung kênh này.">
            <div className="space-y-1.5">
              {showrooms.map((s) => {
                const checked = showroomIds.includes(s.id);
                return (
                  <label key={s.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors"
                    style={{ borderColor: checked ? '#004B9B' : '#e2e8f0', background: checked ? '#e6f0fa' : '#fff' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleShowroom(s.id)} className="accent-[#004B9B]" />
                    <span className="text-sm font-medium text-slate-700">{s.name}</span>
                  </label>
                );
              })}
            </div>
          </Field>
          {showroomIds.length >= 2 && (
            <Field label="Cách chia lead vào các showroom" hint="Áp dụng khi kênh này phục vụ nhiều showroom.">
              <Select value={showroomStrategy} onChange={(e) => setShowroomStrategy(e.target.value as AssignStrategy)}>
                <option value="least_loaded">Chia đều (ưu tiên nơi đang ít lead nhất)</option>
                <option value="round_robin">Xoay vòng (lần lượt từng showroom)</option>
                <option value="weighted">Theo tỷ lệ %</option>
              </Select>
            </Field>
          )}
          {showroomIds.length >= 2 && showroomStrategy === 'weighted' && (
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-500">Tỷ lệ phân bổ cho từng showroom</div>
              {showroomIds.map((id) => {
                const s = showrooms.find((x) => x.id === id);
                return (
                  <div key={id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-slate-700 truncate">{s?.name ?? '—'}</span>
                    <div className="w-20">
                      <TextInput type="number" min={0} value={shares[id] ?? '0'}
                        onChange={(e) => setShares((v) => ({ ...v, [id]: e.target.value }))} />
                    </div>
                    <span className="text-xs text-slate-400">%</span>
                  </div>
                );
              })}
              {(() => {
                const total = showroomIds.reduce((a, id) => a + (Number(shares[id]) || 0), 0);
                return (
                  <div className="text-xs">
                    Tổng:{' '}
                    <span className={total === 100 ? 'font-bold text-emerald-600' : 'font-bold text-amber-600'}>{total}%</span>
                    {total !== 100 && <span className="text-slate-400"> (nên 100%)</span>}
                  </div>
                );
              })()}
            </div>
          )}
          <Field label="Thương hiệu">
            <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">— Chọn thương hiệu —</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Chiến dịch (tuỳ chọn)" hint="Gắn nhãn nguồn để báo cáo theo chiến dịch quảng cáo.">
            <TextInput value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Nhập tên chiến dịch nếu có" />
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
