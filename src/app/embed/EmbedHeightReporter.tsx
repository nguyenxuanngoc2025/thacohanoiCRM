'use client';

import { useEffect } from 'react';

/** Báo chiều cao nội dung cho parent (Budget) để iframe co giãn không cuộn kép.
 *  Gửi '*' (chỉ là số đo, không bí mật) vì Budget có thể ở apex hoặc www. */
export default function EmbedHeightReporter() {
  useEffect(() => {
    const post = () => {
      const h = document.documentElement.scrollHeight;
      try { window.parent?.postMessage({ type: 'crm-embed-height', height: h }, '*'); } catch { /* noop */ }
    };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.documentElement);
    const t = setInterval(post, 1000); // fallback khi đổi tab/bộ lọc không đổi kích thước gốc
    return () => { ro.disconnect(); clearInterval(t); };
  }, []);
  return null;
}
