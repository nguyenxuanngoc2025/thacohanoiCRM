'use client';

import { useCallback, useState } from 'react';
import ModalPortal from './ModalPortal';

/**
 * Hộp thoại trong app thay cho window.confirm / window.alert / window.prompt native
 * (các hộp thoại trình duyệt hiện "domain cho biết…", không khớp giao diện + tệ trên mobile).
 *
 * Cách dùng trong 1 component client:
 *   const { confirm, alert, prompt, dialog } = useDialogs();
 *   ...
 *   if (!(await confirm({ title: 'Xoá?', message: '...', danger: true }))) return;
 *   await alert({ title: 'Lỗi', message: r.error });
 *   const pw = await prompt({ title: 'Mật khẩu mới', inputType: 'password' });
 *   ...
 *   return (<>{dialog}  ...phần JSX còn lại... </>);
 */

type Kind = 'confirm' | 'alert' | 'prompt';

interface Req {
  kind: Kind;
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  inputType: string;
  inputPlaceholder: string;
  resolve: (v: unknown) => void;
}

export function useDialogs() {
  const [req, setReq] = useState<Req | null>(null);
  const [val, setVal] = useState('');

  const confirm = useCallback(
    (o: { title: string; message?: string; confirmText?: string; cancelText?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => {
        setReq({
          kind: 'confirm', title: o.title, message: o.message,
          confirmText: o.confirmText ?? 'Xác nhận', cancelText: o.cancelText ?? 'Hủy',
          danger: o.danger ?? false, inputType: 'text', inputPlaceholder: '',
          resolve: resolve as (v: unknown) => void,
        });
      }),
    [],
  );

  const alert = useCallback(
    (o: { title: string; message?: string; confirmText?: string }) =>
      new Promise<void>((resolve) => {
        setReq({
          kind: 'alert', title: o.title, message: o.message,
          confirmText: o.confirmText ?? 'Đã hiểu', cancelText: '',
          danger: false, inputType: 'text', inputPlaceholder: '',
          resolve: () => resolve(),
        });
      }),
    [],
  );

  const prompt = useCallback(
    (o: {
      title: string; message?: string; confirmText?: string; cancelText?: string;
      inputType?: string; placeholder?: string; initial?: string;
    }) =>
      new Promise<string | null>((resolve) => {
        setVal(o.initial ?? '');
        setReq({
          kind: 'prompt', title: o.title, message: o.message,
          confirmText: o.confirmText ?? 'Xác nhận', cancelText: o.cancelText ?? 'Hủy',
          danger: false, inputType: o.inputType ?? 'text', inputPlaceholder: o.placeholder ?? '',
          resolve: resolve as (v: unknown) => void,
        });
      }),
    [],
  );

  const close = (result: unknown) => {
    req?.resolve(result);
    setReq(null);
  };

  const dismiss = () => {
    if (!req) return;
    if (req.kind === 'alert') close(undefined);
    else close(req.kind === 'prompt' ? null : false);
  };

  const dialog = req ? (
    <ModalPortal>
      <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 p-4" onClick={dismiss}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-900">{req.title}</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            {req.message && <p className="text-sm text-slate-600 whitespace-pre-line">{req.message}</p>}
            {req.kind === 'prompt' && (
              <input
                autoFocus
                type={req.inputType}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder={req.inputPlaceholder}
                onKeyDown={(e) => { if (e.key === 'Enter') close(val); }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#004B9B]"
              />
            )}
          </div>
          <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
            {req.kind !== 'alert' && (
              <button
                onClick={() => close(req.kind === 'prompt' ? null : false)}
                className="rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-medium px-4 py-2 text-slate-600 transition-colors">
                {req.cancelText}
              </button>
            )}
            <button
              onClick={() => close(req.kind === 'confirm' ? true : req.kind === 'prompt' ? val : undefined)}
              className={`rounded-lg text-white text-sm font-medium px-4 py-2 transition-colors ${
                req.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#004B9B] hover:bg-[#003a78]'
              }`}>
              {req.confirmText}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  ) : null;

  return { confirm, alert, prompt, dialog };
}
