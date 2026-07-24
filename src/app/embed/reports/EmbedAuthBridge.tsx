'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const BUDGET_ORIGIN = process.env.NEXT_PUBLIC_BUDGET_ORIGIN || 'https://thacoautohn-mkt.com';

/**
 * Nhận phiên đăng nhập từ Budget (parent) qua postMessage → setSession (ghi cookie CRM) → reload.
 * Cùng 1 Supabase project nên access_token của Budget hợp lệ với CRM. Chỉ nhận từ đúng origin Budget.
 */
export default function EmbedAuthBridge() {
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let handling = false;

    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== BUDGET_ORIGIN) return;
      const d = e.data as { type?: string; access_token?: string; refresh_token?: string } | null;
      if (!d || d.type !== 'crm-embed-token' || typeof d.access_token !== 'string' || typeof d.refresh_token !== 'string') return;
      if (handling) return;
      handling = true;
      const { error } = await supabase.auth.setSession({ access_token: d.access_token, refresh_token: d.refresh_token });
      if (error) { setErr('Không thiết lập được phiên đăng nhập.'); handling = false; return; }
      window.location.reload();
    };

    window.addEventListener('message', onMessage);
    // Báo parent đã sẵn sàng nhận token.
    try { window.parent?.postMessage({ type: 'crm-embed-ready' }, BUDGET_ORIGIN); } catch { /* noop */ }
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[300px] text-sm text-slate-400">
      {err ?? 'Đang tải báo cáo…'}
    </div>
  );
}
