'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, UserPlus, Sparkles } from 'lucide-react';
import { createLead, recommendAssignment } from './actions';
import { DIGITAL_PLATFORMS, DEFAULT_PLATFORM_KEY } from '@/lib/platforms';
import { SOURCE_VARIANTS } from '@/lib/source';
import type { ModelOption, BrandOption, ShowroomOption, AssigneeOption, TeamOption } from './LeadsView';
import ModalPortal from '@/components/ui/ModalPortal';

export default function NewLeadModal({
  brands, showrooms, models, assignees, teams, fixedTeamId, onClose,
}: {
  brands: BrandOption[];
  showrooms: ShowroomOption[];
  models: ModelOption[];
  assignees: AssigneeOption[];
  teams: TeamOption[];
  // Phòng cố định theo cấp (tp_phong tạo lead cho chính phòng mình) — khoá + ẩn ô Phòng.
  fixedTeamId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form co giãn theo phạm vi người tạo: 1 lựa chọn → tự chọn + ẩn ô (đỡ rối cho cấp thấp).
  const lockShowroom = showrooms.length === 1;
  const lockBrand = brands.length === 1;
  const lockTeam = !!fixedTeamId;
  const fixedTeam = fixedTeamId ? teams.find((t) => t.id === fixedTeamId) ?? null : null;

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [brandId, setBrandId] = useState(lockBrand ? brands[0].id : '');
  const [showroomId, setShowroomId] = useState(lockShowroom ? showrooms[0].id : '');
  // Phòng (sales_team): để trống = tự động theo cấu hình; chọn cụ thể khi khách muốn về 1 phòng.
  const [salesTeamId, setSalesTeamId] = useState(lockTeam ? (fixedTeamId as string) : '');
  const [modelId, setModelId] = useState('');
  // Nguồn = kênh (platform key); nếu kênh có phân nhánh thì chọn thêm chi tiết kênh
  const [sourceKey, setSourceKey] = useState<string>(DEFAULT_PLATFORM_KEY);
  const variants = SOURCE_VARIANTS[sourceKey];
  const [variant, setVariant] = useState<string>(variants?.[0]?.value ?? '');
  const [assignedTo, setAssignedTo] = useState('');
  const [note, setNote] = useState('');

  // Gợi ý phân giao (xoay vòng đều) — tên hiển thị cạnh field, vẫn cho chọn lại
  const [recShowroom, setRecShowroom] = useState<string | null>(null);
  const [recAssignee, setRecAssignee] = useState<string | null>(null);

  const brandModels = models.filter((m) => m.brand_id === brandId);

  // Phòng khả dụng: theo showroom đã chọn (+ thương hiệu nếu đã chọn, vì phòng gắn TẬP brand_ids).
  const availableTeams = teams.filter(
    (t) => (!showroomId || t.showroom_id === showroomId) && (!brandId || t.brand_ids.includes(brandId)),
  );
  // TVBH khả dụng: nếu đã chọn phòng → chỉ TVBH của phòng; chưa chọn phòng nhưng có showroom → TVBH của showroom.
  const availableAssignees = salesTeamId
    ? assignees.filter((a) => a.sales_team_id === salesTeamId)
    : showroomId
      ? assignees.filter((a) => a.showroom_id === showroomId)
      : assignees;

  // Lần mở modal: gợi ý showroom ít lead nhất + TVBH ít lead nhất, tự điền nếu còn trống.
  // Suy ra phòng từ TVBH gợi ý (TVBH thuộc 1 phòng) để điền sẵn ô Phòng.
  useEffect(() => {
    let alive = true;
    recommendAssignment(null).then((r) => {
      if (!alive) return;
      // Chỉ nhận gợi ý showroom khi ô showroom mở VÀ showroom gợi ý nằm trong phạm vi.
      const inScope = !!r.showroomId && showrooms.some((s) => s.id === r.showroomId);
      if (!lockShowroom && inScope) {
        setRecShowroom(r.showroomName);
        setShowroomId((cur) => cur || r.showroomId || '');
      }
      // Phòng bị khoá (tp_phong) → không để gợi ý ghi đè.
      if (!lockTeam && inScope) {
        setRecAssignee(r.assigneeName);
        setAssignedTo((cur) => cur || r.assigneeId || '');
        const team = r.assigneeId ? assignees.find((a) => a.id === r.assigneeId)?.sales_team_id : null;
        if (team) setSalesTeamId((cur) => cur || team);
      }
    });
    return () => { alive = false; };
  }, [assignees, showrooms, lockShowroom, lockTeam]);

  // Đổi showroom thủ công → reset phòng (phòng gắn showroom) + tính lại TVBH gợi ý.
  const onShowroomChange = (id: string) => {
    setShowroomId(id);
    setSalesTeamId('');
    if (!id) { setRecAssignee(null); setAssignedTo(''); return; }
    recommendAssignment(id).then((r) => {
      setRecAssignee(r.assigneeName);
      setAssignedTo(r.assigneeId || '');
      const team = r.assigneeId ? assignees.find((a) => a.id === r.assigneeId)?.sales_team_id : null;
      setSalesTeamId(team || '');
    });
  };

  // Đổi phòng → lọc lại TVBH; nếu TVBH đang chọn không thuộc phòng mới thì bỏ chọn.
  const onTeamChange = (id: string) => {
    setSalesTeamId(id);
    if (id && assignedTo && !assignees.some((a) => a.id === assignedTo && a.sales_team_id === id)) {
      setAssignedTo('');
      setRecAssignee(null);
    }
  };

  // Đổi kênh → đặt lại nhánh mặc định (nhánh đầu nếu kênh có phân nhánh)
  const onSourceChange = (key: string) => {
    setSourceKey(key);
    setVariant(SOURCE_VARIANTS[key]?.[0]?.value ?? '');
  };

  const submit = () => {
    setError(null);
    if (!phone.trim()) { setError('Nhập số điện thoại.'); return; }
    if (!brandId) { setError('Chọn thương hiệu.'); return; }
    // Kênh có phân nhánh → lưu giá trị nhánh (vd fb_message); không nhánh → lưu tên kênh
    const platformName = DIGITAL_PLATFORMS.find((p) => p.key === sourceKey)?.name ?? sourceKey;
    const source = variants ? (variant || variants[0].value) : platformName;
    start(async () => {
      const res = await createLead({
        fullName,
        phone,
        brandId,
        showroomId: showroomId || null,
        salesTeamId: salesTeamId || null,
        modelId: modelId || null,
        source,
        assignedTo: assignedTo || null,
        note,
      });
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setError(res.error ?? 'Tạo lead thất bại.');
      }
    });
  };

  const inputCls = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:border-[#004B9B] outline-none';
  const lblCls = 'text-sm text-slate-600 block mb-1';

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <h3 className="font-bold text-slate-900 inline-flex items-center gap-2">
            <UserPlus size={18} style={{ color: '#004B9B' }} /> Thêm lead thủ công
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <div>
            <label className={lblCls}>Họ tên</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" className={inputCls} />
          </div>

          <div>
            <label className={lblCls}>Số điện thoại <span className="text-rose-500">*</span></label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912 345 678" inputMode="tel" className={inputCls} />
          </div>

          {lockShowroom ? (
            <div>
              <label className={lblCls}>Showroom</label>
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{showrooms[0].name}</p>
            </div>
          ) : (
            <div>
              <label className={lblCls}>Showroom</label>
              <select value={showroomId} onChange={(e) => onShowroomChange(e.target.value)} className={inputCls}>
                <option value="">— Chưa rõ —</option>
                {showrooms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {recShowroom && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#004B9B]">
                  <Sparkles size={12} /> Gợi ý xoay vòng: {recShowroom}
                </p>
              )}
            </div>
          )}

          {lockBrand ? (
            <div>
              <label className={lblCls}>Thương hiệu</label>
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{brands[0].name}</p>
            </div>
          ) : (
            <div>
              <label className={lblCls}>Thương hiệu <span className="text-rose-500">*</span></label>
              <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setModelId(''); setSalesTeamId(''); }} className={inputCls}>
                <option value="">— Chọn thương hiệu —</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          {lockTeam ? (
            <div>
              <label className={lblCls}>Phòng bán hàng</label>
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{fixedTeam?.name ?? 'Phòng của bạn'}</p>
            </div>
          ) : (
            <div>
              <label className={lblCls}>Phòng bán hàng</label>
              <select value={salesTeamId} onChange={(e) => onTeamChange(e.target.value)} className={inputCls}>
                <option value="">— Tự động —</option>
                {availableTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-slate-400">Để trống = hệ thống tự chia phòng. Chọn cụ thể khi khách muốn về một phòng.</p>
            </div>
          )}

          <div>
            <label className={lblCls}>Dòng xe quan tâm</label>
            <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!brandId} className={`${inputCls} disabled:opacity-50`}>
              <option value="">{brandId ? '— Chưa rõ —' : '— Chọn thương hiệu trước —'}</option>
              {brandModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div>
            <label className={lblCls}>Nguồn</label>
            <select value={sourceKey} onChange={(e) => onSourceChange(e.target.value)} className={inputCls}>
              {DIGITAL_PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </div>

          {variants && (
            <div>
              <label className={lblCls}>Chi tiết kênh</label>
              <select value={variant} onChange={(e) => setVariant(e.target.value)} className={inputCls}>
                {variants.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={lblCls}>Phụ trách</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputCls}>
              <option value="">— Chưa giao —</option>
              {availableAssignees.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
            {recAssignee && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#004B9B]">
                <Sparkles size={12} /> Gợi ý xoay vòng: {recAssignee}
              </p>
            )}
          </div>

          <div>
            <label className={lblCls}>Ghi chú</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              placeholder="VD: Khách hỏi giá lăn bánh Carnival…"
              className={`${inputCls} resize-none`} />
          </div>

          {error && <div className="text-sm bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100 shrink-0">
          <button onClick={onClose} disabled={pending}
            className="text-sm font-medium text-slate-600 border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50 disabled:opacity-50">
            Hủy
          </button>
          <button onClick={submit} disabled={pending}
            className="text-sm font-semibold text-white rounded-lg px-4 py-2 disabled:opacity-50"
            style={{ background: '#004B9B' }}>
            {pending ? 'Đang tạo…' : 'Tạo lead'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
