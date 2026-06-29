'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, UserCheck, HeartHandshake, BarChart3,
  Settings, LogOut, Key, User, MoreHorizontal,
} from 'lucide-react';
import { NAV_ITEMS } from '@/lib/nav';
import { logout } from '@/app/login/actions';
import { type UserRole } from '@/types/database';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Users, UserCheck, HeartHandshake, BarChart3, Settings,
};

const BRAND = '#004B9B';

export interface MobileNavProps {
  userRole: UserRole;
  userName: string;
  userCode?: string;
}

/**
 * Thanh điều hướng đáy màn hình cho mobile (kiểu app) — thay sidebar trái.
 * Đặt ở thumb-zone (đáy), touch target ≥56px, icon + nhãn ngắn.
 * Chỉ hiển thị trên mobile (lg:hidden); desktop dùng Sidebar.
 */
export default function MobileNav({ userRole, userName, userCode = '' }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(userRole));
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Đóng menu tài khoản khi đổi trang.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const initials = userName.split(' ').map((w) => w[0]).join('').slice(-2).toUpperCase();

  const navigate = (href: string) => { setMenuOpen(false); router.push(href); };
  const handleSignOut = async () => { setMenuOpen(false); await logout(); };

  return (
    <div ref={wrapRef} className="lg:hidden shrink-0 relative">
      {/* Bảng tài khoản trượt lên từ đáy */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setMenuOpen(false)} />
          <div className="absolute bottom-full left-0 right-0 z-50 bg-white border-t border-slate-200 rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.12)] pb-2">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ background: BRAND }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 truncate">{userName}</div>
                {userCode && <div className="text-xs text-slate-400 truncate">{userCode}</div>}
              </div>
            </div>
            <SheetItem icon={<User size={18} />} label="Hồ sơ cá nhân" onClick={() => navigate('/settings/profile')} />
            <SheetItem icon={<Key size={18} />} label="Đổi mật khẩu" onClick={() => navigate('/settings/profile#password')} />
            <SheetItem icon={<LogOut size={18} />} label="Đăng xuất" danger onClick={handleSignOut} />
          </div>
        </>
      )}

      {/* Thanh tab đáy */}
      <nav
        className="flex items-stretch bg-white border-t border-slate-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {items.map((item) => {
          const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
          const active = !!pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] active:bg-slate-50"
              style={{ color: active ? BRAND : '#94a3b8' }}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10.5px] font-medium leading-none" style={{ fontWeight: active ? 600 : 500 }}>
                {item.label}
              </span>
            </Link>
          );
        })}
        {/* Tài khoản */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] active:bg-slate-50"
          style={{ color: menuOpen ? BRAND : '#94a3b8' }}
        >
          <MoreHorizontal size={22} strokeWidth={menuOpen ? 2.4 : 2} />
          <span className="text-[10.5px] font-medium leading-none" style={{ fontWeight: menuOpen ? 600 : 500 }}>
            Tài khoản
          </span>
        </button>
      </nav>
    </div>
  );
}

function SheetItem({ icon, label, danger, onClick }: {
  icon: React.ReactNode; label: string; danger?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-[15px] active:bg-slate-50 ${danger ? 'text-rose-600' : 'text-slate-700'}`}
    >
      <span className={danger ? 'text-rose-500' : 'text-slate-400'}>{icon}</span>
      {label}
    </button>
  );
}
