'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Đưa modal ra thẳng <body> để thoát khỏi vùng cuộn `<main>`
 * (trên iOS, position:fixed bên trong scroll-container `-webkit-overflow-scrolling:touch`
 * bị giam trong vùng đó → footer/nút bị che sau thanh điều hướng đáy).
 * Khoá cuộn nền khi modal mở.
 */
export default function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
