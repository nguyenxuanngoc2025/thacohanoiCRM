'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Play, Power, CalendarClock, AlertTriangle, RefreshCw, Eye } from 'lucide-react';
import { presetToCalendar, describeCalendar, type Preset } from '@/lib/cron-admin';
import { unitHasSample } from '@/lib/report-sample';

interface TimerView {
  unit: string;
  service: string;
  group: 'crm' | 'infra' | 'os';
  dangerous: boolean;
  title: string;
  description: string;
  explain: string;
  enabled: boolean;
  unitFileState: string;
  light: 'green' | 'gray' | 'red';
  calendars: string[];
  nextRun: string;
  lastRun: string;
  lastResult: string;
}

const GROUP_LABEL: Record<TimerView['group'], string> = {
  crm: 'CRM', infra: 'Hạ tầng', os: 'Hệ điều hành',
};
const GROUP_DESC: Record<TimerView['group'], string> = {
  crm: 'Tác vụ của hệ thống CRM — thu lead, báo cáo, cảnh báo. An toàn để bật/tắt/đổi lịch.',
  infra: 'Tác vụ nền tảng giữ website chạy (bảo mật, sao lưu). Thay đổi cần thận trọng.',
  os: 'Tác vụ bảo trì của máy chủ. KHÔNG nên tắt trừ khi bạn hiểu rõ hậu quả.',
};
const LIGHT_COLOR: Record<TimerView['light'], string> = {
  green: '#16a34a', gray: '#94a3b8', red: '#dc2626',
};

export default function CronManager() {
  const [timers, setTimers] = useState<TimerView[] | null>(null);
  const [error, setError] = useState('');
  const [busyUnit, setBusyUnit] = useState('');
  const [confirm, setConfirm] = useState<{ t: TimerView; action: 'enable' | 'disable' | 'run' } | null>(null);
  const [reschedule, setReschedule] = useState<TimerView | null>(null);
  const [preview, setPreview] = useState<TimerView | null>(null);

  const load = useCallback(async () => {
    setError('');
    const res = await fetch('/api/platform/cron', { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json?.error ?? 'Không tải được danh sách.'); return; }
    setTimers(json.timers as TimerView[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const doAction = async (unit: string, action: string, calendars?: string[]) => {
    setBusyUnit(unit);
    setError('');
    const res = await fetch('/api/platform/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, unit, calendars }),
    });
    const json = await res.json().catch(() => ({}));
    setBusyUnit('');
    if (!res.ok) { setError(json?.error ?? 'Thao tác thất bại.'); return false; }
    await load();
    return true;
  };

  if (error && !timers) {
    return <div className="text-sm text-rose-600">{error}</div>;
  }
  if (!timers) return <div className="text-sm text-slate-400">Đang tải...</div>;

  const groups: TimerView['group'][] = ['crm', 'infra', 'os'];

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-sm rounded-lg px-3 py-2 border bg-rose-50 border-rose-200 text-rose-700">
          {error}
        </div>
      )}

      <Legend />

      <button onClick={load} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
        <RefreshCw size={13} /> Làm mới
      </button>

      {groups.map((g) => {
        const rows = timers.filter((t) => t.group === g);
        if (rows.length === 0) return null;
        return (
          <div key={g}>
            <h2 className="text-sm font-semibold text-slate-700">{GROUP_LABEL[g]}</h2>
            <p className="text-xs text-slate-400 mb-2">{GROUP_DESC[g]}</p>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-2 font-medium">Tác vụ</th>
                    <th className="px-4 py-2 font-medium">Lịch chạy (giờ VN)</th>
                    <th className="px-4 py-2 font-medium text-right">Điều khiển</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.unit} className="border-b border-slate-50 last:border-0 align-top">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: LIGHT_COLOR[t.light] }} />
                          <div className="min-w-0">
                            <div className="font-medium text-slate-800 flex items-center gap-1.5">
                              {t.title}
                              {t.dangerous && (
                                <span title="Tác vụ hệ thống — đổi lịch/tắt cần thận trọng">
                                  <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 max-w-md">{t.explain}</div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">{t.unit}{!t.enabled && ' · đã tắt'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {t.calendars.length ? t.calendars.map((c, i) => <div key={i}>{describeCalendar(c)}</div>) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          {unitHasSample(t.unit) && (
                            <IconBtn title="Xem nội dung mẫu" onClick={() => setPreview(t)}>
                              <Eye size={15} />
                            </IconBtn>
                          )}
                          <IconBtn title="Chạy ngay" disabled={busyUnit === t.unit}
                            onClick={() => (t.dangerous ? setConfirm({ t, action: 'run' }) : doAction(t.unit, 'run'))}>
                            <Play size={15} />
                          </IconBtn>
                          <IconBtn title="Đổi lịch" disabled={busyUnit === t.unit}
                            onClick={() => setReschedule(t)}>
                            <CalendarClock size={15} />
                          </IconBtn>
                          <IconBtn title={t.enabled ? 'Tắt' : 'Bật'} disabled={busyUnit === t.unit}
                            danger={t.enabled}
                            onClick={() => {
                              const action = t.enabled ? 'disable' : 'enable';
                              if (t.dangerous) setConfirm({ t, action });
                              else doAction(t.unit, action);
                            }}>
                            <Power size={15} />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {confirm && (
        <ConfirmModal
          timer={confirm.t}
          action={confirm.action}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const t = confirm.t; const a = confirm.action; setConfirm(null);
            await doAction(t.unit, a);
          }}
        />
      )}
      {reschedule && (
        <RescheduleModal
          timer={reschedule}
          onCancel={() => setReschedule(null)}
          onSave={async (cals) => {
            const t = reschedule; setReschedule(null);
            await doAction(t.unit, 'reschedule', cals);
          }}
        />
      )}
      {preview && <PreviewModal timer={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// Đổi marker <b>/<i> (định dạng tin Zalo) thành chữ đậm/nghiêng để xem cho dễ.
function renderMarked(text: string): React.ReactNode {
  return text.split('\n').map((line, li) => {
    const parts: React.ReactNode[] = [];
    const re = /<(b|i)>(.*?)<\/\1>/g;
    let last = 0; let m: RegExpExecArray | null; let k = 0;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      parts.push(m[1] === 'b'
        ? <strong key={k++}>{m[2]}</strong>
        : <em key={k++}>{m[2]}</em>);
      last = m.index + m[0].length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return <div key={li}>{parts.length ? parts : '\u00A0'}</div>;
  });
}

function PreviewModal({ timer, onClose }: { timer: TimerView; onClose: () => void }) {
  const [sections, setSections] = useState<{ label: string; text: string }[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/platform/cron/preview?unit=${encodeURIComponent(timer.unit)}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json?.error ?? 'Không tải được nội dung mẫu.'); return; }
      setSections(json.sections as { label: string; text: string }[]);
    })();
  }, [timer.unit]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-slate-900">Nội dung mẫu — {timer.title}</h3>
        <p className="text-xs text-slate-400 mt-0.5 mb-4">
          Tin minh hoạ bằng số liệu giả để bạn hình dung. Số thật sẽ được tính khi tới giờ chạy.
        </p>
        {err && <div className="text-sm text-rose-600">{err}</div>}
        {!sections && !err && <div className="text-sm text-slate-400">Đang tải...</div>}
        <div className="space-y-4">
          {sections?.map((s, i) => (
            <div key={i}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Gửi tới: {s.label}</div>
              <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 leading-relaxed">
                {renderMarked(s.text)}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Đóng</button>
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Cách đọc bảng này</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Mỗi dòng là một tác vụ chạy tự động theo lịch. Đèn tròn cho biết tình trạng, dấu tam giác cam là tác vụ cần thận trọng.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#16a34a' }} />
          <span><b>Xanh</b> — đang bật và lần chạy gần nhất tốt.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#94a3b8' }} />
          <span><b>Xám</b> — đã tắt, hiện không chạy.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#dc2626' }} />
          <span><b>Đỏ</b> — đang bật nhưng lần chạy cuối bị lỗi, cần kiểm tra.</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle size={13} className="text-amber-500 shrink-0" />
          <span><b>Dấu cảnh báo</b> — tác vụ hạ tầng/hệ điều hành, đổi lịch hay tắt sẽ hỏi xác nhận.</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 pt-1 border-t border-slate-100">
        <span><Eye size={12} className="inline -mt-0.5 mr-1" />Xem nội dung mẫu tin</span>
        <span><Play size={12} className="inline -mt-0.5 mr-1" />Chạy ngay một lần</span>
        <span><CalendarClock size={12} className="inline -mt-0.5 mr-1" />Đổi lịch chạy</span>
        <span><Power size={12} className="inline -mt-0.5 mr-1" />Bật hoặc tắt</span>
      </div>
    </div>
  );
}

function IconBtn({
  children, title, onClick, disabled, danger,
}: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
        danger ? 'border-rose-200 text-rose-600 hover:bg-rose-50' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

const ACTION_LABEL: Record<string, string> = { enable: 'Bật', disable: 'Tắt', run: 'Chạy ngay' };

function ConfirmModal({
  timer, action, onCancel, onConfirm,
}: { timer: TimerView; action: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Overlay onClose={onCancel}>
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={18} className="text-amber-500" />
        <h3 className="font-semibold text-slate-900">{ACTION_LABEL[action]} tác vụ hệ thống?</h3>
      </div>
      <p className="text-sm text-slate-600 mb-1">{timer.title}</p>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
        Đây là tác vụ hạ tầng / hệ điều hành. Thay đổi sai có thể ảnh hưởng máy chủ (sao lưu, chứng chỉ, cập nhật hệ thống). Chắc chắn tiếp tục?
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Huỷ</button>
        <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-lg font-semibold text-white bg-rose-600 hover:bg-rose-700">
          {ACTION_LABEL[action]}
        </button>
      </div>
    </Overlay>
  );
}

const WEEKDAYS = [
  { v: 'Mon', l: 'Thứ 2' }, { v: 'Tue', l: 'Thứ 3' }, { v: 'Wed', l: 'Thứ 4' },
  { v: 'Thu', l: 'Thứ 5' }, { v: 'Fri', l: 'Thứ 6' }, { v: 'Sat', l: 'Thứ 7' }, { v: 'Sun', l: 'CN' },
];

function RescheduleModal({
  timer, onCancel, onSave,
}: { timer: TimerView; onCancel: () => void; onSave: (cals: string[]) => void }) {
  const [mode, setMode] = useState<'preset' | 'advanced'>('preset');
  const [kind, setKind] = useState<Preset['kind']>('dailyAt');
  const [n, setN] = useState(5);
  const [hour, setHour] = useState(6);
  const [minute, setMinute] = useState(0);
  const [weekday, setWeekday] = useState('Mon');
  const [advanced, setAdvanced] = useState(timer.calendars.join('\n'));

  const buildPreset = (): string => {
    if (kind === 'everyNMin') return presetToCalendar({ kind: 'everyNMin', n });
    if (kind === 'hourly') return presetToCalendar({ kind: 'hourly' });
    if (kind === 'weeklyAt') return presetToCalendar({ kind: 'weeklyAt', weekday, hour, minute });
    return presetToCalendar({ kind: 'dailyAt', hour, minute });
  };

  const save = () => {
    if (mode === 'advanced') {
      const cals = advanced.split('\n').map((s) => s.trim()).filter(Boolean);
      onSave(cals);
    } else {
      onSave([buildPreset()]);
    }
  };

  return (
    <Overlay onClose={onCancel}>
      <h3 className="font-semibold text-slate-900 mb-1">Đổi lịch chạy</h3>
      <p className="text-sm text-slate-500 mb-1">{timer.title}</p>
      <p className="text-xs text-slate-400 mb-4">Lịch hiện tại: {timer.calendars.join(' · ') || '—'}</p>

      <div className="flex gap-1 mb-4 text-xs">
        <TabBtn active={mode === 'preset'} onClick={() => setMode('preset')}>Nhanh</TabBtn>
        <TabBtn active={mode === 'advanced'} onClick={() => setMode('advanced')}>Nâng cao</TabBtn>
      </div>

      {mode === 'preset' ? (
        <div className="space-y-3">
          <select value={kind} onChange={(e) => setKind(e.target.value as Preset['kind'])}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="everyNMin">Mỗi N phút</option>
            <option value="hourly">Mỗi giờ</option>
            <option value="dailyAt">Hằng ngày lúc</option>
            <option value="weeklyAt">Hằng tuần</option>
          </select>
          {kind === 'everyNMin' && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Mỗi
              <input type="number" min={1} max={59} value={n} onChange={(e) => setN(Number(e.target.value))}
                className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" /> phút
            </label>
          )}
          {kind === 'weeklyAt' && (
            <select value={weekday} onChange={(e) => setWeekday(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {WEEKDAYS.map((w) => <option key={w.v} value={w.v}>{w.l}</option>)}
            </select>
          )}
          {(kind === 'dailyAt' || kind === 'weeklyAt') && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Lúc
              <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" /> :
              <input type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Number(e.target.value))}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              <span className="text-xs text-slate-400">(giờ VN)</span>
            </label>
          )}
          <p className="text-xs text-slate-400 font-mono bg-slate-50 rounded-lg px-3 py-2">→ {buildPreset()}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Mỗi dòng 1 biểu thức OnCalendar (systemd). Ví dụ: <span className="font-mono">*-*-* 06:00:00 Asia/Ho_Chi_Minh</span></p>
          <textarea value={advanced} onChange={(e) => setAdvanced(e.target.value)} rows={4}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
        </div>
      )}

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Huỷ</button>
        <button onClick={save} className="px-4 py-2 text-sm rounded-lg font-semibold text-white" style={{ background: 'var(--color-brand)' }}>Lưu lịch</button>
      </div>
    </Overlay>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg font-medium ${active ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>
      {children}
    </button>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
