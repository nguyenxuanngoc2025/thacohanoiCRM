'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, UserCheck, HeartHandshake, BarChart3,
  Settings, LogOut, Key, User, MoreHorizontal, FileCheck2, GitBranch,
} from 'lucide-react';
import { NAV_ITEMS } from '@/lib/nav';
import { logout } from '@/app/login/actions';
import { type UserRole } from '@/types/database';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Users, UserCheck, HeartHandshake, BarChart3, Settings, FileCheck2, GitBranch,
};

const BRAND = '#004B9B';

export interface MobileNavProps {
  userRole: UserRole;
  userName: string;
  userCode?: string;
  b10Enabled: boolean;
}

/**
 * Thanh điều hướng đáy cho mobile (kiểu app) — thay sidebar trái.
 * Tông tối gradient lấy từ sidebar desktop (var(--sidebar-bg)), neo cứng ở đáy
 * (in-flow trong cột flex chiều cao cố định → không bao giờ trôi khi cuộn).
 * Tab active có viên nền nổi bật giống mục active của sidebar.
 */
export default function MobileNav({ userRole, userName, userCode = '', b10Enabled }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV_ITEMS.filter((item) =>
    item.roles.includes(userRole) && (!item.requiresB10 || b10Enabled),
  );
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

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const initials = userName.split(' ').map((w) => w[0]).join('').slice(-2).toUpperCase();

  const navigate = (href: string) => { setMenuOpen(false); router.push(href); };
  const handleSignOut = async () => { setMenuOpen(false); await logout(); };

  return (
    <div
      ref={wrapRef}
      className="lg:hidden shrink-0 relative"
      style={{
        background: 'var(--sidebar-bg)',
        boxShadow: '0 -6px 20px rgba(0,0,0,0.18)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Bảng tài khoản trượt lên từ đáy */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setMenuOpen(false)} />
          <div className="absolute bottom-full left-0 right-0 z-50 bg-white border-t border-slate-200 rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.16)] pb-2">
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
      <nav className="flex items-stretch px-1.5 pt-1.5 pb-1">
        {items.map((item) => {
          const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
          const active = !!pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 min-h-[52px] rounded-lg transition-colors"
              style={{
                color: active ? '#ffffff' : 'rgba(255,255,255,0.62)',
                background: active ? 'rgba(255,255,255,0.16)' : 'transparent',
              }}
            >
              <Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
              <span className="text-[10.5px] leading-none" style={{ fontWeight: active ? 700 : 500 }}>
                {item.label}
              </span>
            </Link>
          );
        })}
        {/* Tài khoản */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 min-h-[52px] rounded-lg transition-colors"
          style={{
            color: menuOpen ? '#ffffff' : 'rgba(255,255,255,0.62)',
            background: menuOpen ? 'rgba(255,255,255,0.16)' : 'transparent',
          }}
        >
          <MoreHorizontal size={21} strokeWidth={menuOpen ? 2.4 : 1.9} />
          <span className="text-[10.5px] leading-none" style={{ fontWeight: menuOpen ? 700 : 500 }}>
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
