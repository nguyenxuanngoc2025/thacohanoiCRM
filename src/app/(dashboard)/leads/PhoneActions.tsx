'use client';

// Hiển thị SĐT kèm hành động: MOBILE chạm số để GỌI (tel:), DESKTOP chạm số để COPY.
// Nút Zalo hiện ở cả hai (mobile mở app, desktop mở web). Chặn nổi bọt để không mở drawer.
import { useState } from 'react';
import { Phone, Copy, Check, MessageCircle } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/phone';

// Số dạng nội địa (0…) cho Zalo & copy; tel: dùng số nguyên bản (+84…) cho chính xác quốc tế.
function national(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.startsWith('84') ? '0' + d.slice(2) : d;
}

export default function PhoneActions({ phone, size = 'sm' }: { phone: string; size?: 'sm' | 'md' }) {
  const [copied, setCopied] = useState(false);
  const display = formatPhoneDisplay(phone);
  const local = national(phone);
  const text = size === 'md' ? 'text-sm' : 'text-[13px]';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(local);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard bị chặn (context không bảo mật) → bỏ qua */
    }
  };

  return (
    <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {/* MOBILE: chạm để gọi */}
      <a
        href={`tel:${phone}`}
        className={`lg:hidden inline-flex items-center gap-1 font-semibold tabular-nums ${text}`}
        style={{ color: 'var(--color-brand)' }}
      >
        <Phone size={13} className="shrink-0" />
        {display}
      </a>
      {/* DESKTOP: chạm để copy */}
      <button
        type="button"
        onClick={copy}
        title="Sao chép số điện thoại"
        className={`hidden lg:inline-flex items-center gap-1 tabular-nums text-slate-600 hover:text-brand transition-colors ${text}`}
      >
        {display}
        {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={12} className="opacity-40" />}
      </button>
      {/* ZALO: cả hai nền tảng */}
      <a
        href={`https://zalo.me/${local}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Nhắn Zalo"
        className="text-slate-400 hover:text-sky-600 transition-colors shrink-0"
      >
        <MessageCircle size={13} />
      </a>
    </span>
  );
}
