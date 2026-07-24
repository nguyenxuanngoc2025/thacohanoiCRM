'use client';

import { useEffect } from 'react';

const BUDGET_ORIGIN = process.env.NEXT_PUBLIC_BUDGET_ORIGIN || 'https://thacoautohn-mkt.com';

/** Báo chiều cao nội dung cho parent (Budget) để iframe co giãn không cuộn kép. */
export default function EmbedHeightReporter() {
  useEffect(() => {
    const post = () => {
      const h = document.documentElement.scrollHeight;
      try { window.parent?.postMessage({ type: 'crm-embed-height', height: h }, BUDGET_ORIGIN); } catch { /* noop */ }
    };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.documentElement);
    const t = setInterval(post, 1000); // fallback khi đổi tab/bộ lọc không đổi kích thước gốc
    return () => { ro.disconnect(); clearInterval(t); };
  }, []);
  return null;
}
