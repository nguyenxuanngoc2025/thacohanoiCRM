'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ChangePasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (next.length < 6) {
      setError('Mật khẩu mới phải từ 6 ký tự trở lên.');
      return;
    }
    if (next !== confirm) {
      setError('Xác nhận mật khẩu không khớp.');
      return;
    }
    if (next === current) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }

    setBusy(true);
    const supabase = createClient();

    // Xác thực lại mật khẩu hiện tại trước khi cho đổi.
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: current });
    if (authErr) {
      setBusy(false);
      setError('Mật khẩu hiện tại không đúng.');
      return;
    }

    const { error: updErr } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (updErr) {
      setError('Không đổi được mật khẩu. Vui lòng thử lại.');
      return;
    }

    setCurrent('');
    setNext('');
    setConfirm('');
    setDone(true);
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <Input label="Mật khẩu hiện tại" value={current} onChange={setCurrent} />
      <Input label="Mật khẩu mới" value={next} onChange={setNext} />
      <Input label="Nhập lại mật khẩu mới" value={confirm} onChange={setConfirm} />

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {done && <p className="text-sm text-emerald-600">Đã đổi mật khẩu thành công.</p>}

      <button
        type="submit"
        disabled={busy}
        className="text-sm font-semibold rounded-lg px-4 py-2 text-white shadow-sm disabled:opacity-60"
        style={{ background: 'var(--color-brand)' }}
      >
        {busy ? 'Đang đổi…' : 'Đổi mật khẩu'}
      </button>
    </form>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-brand"
      />
    </div>
  );
}
