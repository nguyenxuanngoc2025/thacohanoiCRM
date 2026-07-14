'use client';

import { useEffect } from 'react';

// Đăng ký service worker (passthrough) để trình duyệt cho phép cài PWA.
export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
