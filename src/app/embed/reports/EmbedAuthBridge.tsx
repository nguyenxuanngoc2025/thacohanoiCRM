'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Nhận phiên đăng nhập từ Budget (parent) qua postMessage → setSession (ghi cookie CRM) → reload.
 * Cùng 1 Supabase project nên access_token của Budget hợp lệ với CRM.
 * Budget có thể chạy ở apex HOẶC www (2 origin đều được phục vụ, không redirect) → chấp nhận mọi
 * origin thuộc registrable-domain thacoautohn-mkt.com. An toàn: CSP frame-ancestors đã giới hạn ai
 * được nhúng /embed đúng bộ domain này; token push vào là phiên của chính user.
 */
function isTrustedBudgetOrigin(origin: string) {
  return /^https:\/\/([a-z0-9-]+\.)?thacoautohn-mkt\.com$/.test(origin);
}

export default function EmbedAuthBridge() {
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let handling = false;

    const onMessage = async (e: MessageEvent) => {
      if (!isTrustedBudgetOrigin(e.origin)) return;
      const d = e.data as { type?: string; access_token?: string; refresh_token?: string } | null;
      if (!d || d.type !== 'crm-embed-token' || typeof d.access_token !== 'string' || typeof d.refresh_token !== 'string') return;
      if (handling) return;
      handling = true;
      const { error } = await supabase.auth.setSession({ access_token: d.access_token, refresh_token: d.refresh_token });
      if (error) { setErr('Không thiết lập được phiên đăng nhập.'); handling = false; return; }
      window.location.reload();
    };

    window.addEventListener('message', onMessage);
    // Báo parent đã sẵn sàng nhận token. Gửi '*' (không kèm bí mật) + lặp vài lần phòng parent chưa
    // gắn listener kịp / origin parent khác apex.
    const ping = () => { try { window.parent?.postMessage({ type: 'crm-embed-ready' }, '*'); } catch { /* noop */ } };
    ping();
    const t1 = setTimeout(ping, 300);
    const t2 = setTimeout(ping, 1000);
    return () => { window.removeEventListener('message', onMessage); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[300px] text-sm text-slate-400">
      {err ?? 'Đang tải báo cáo…'}
    </div>
  );
}
