'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, UserCheck, HeartHandshake, BarChart3,
  Settings, ChevronRight, ChevronLeft, LogOut, Key, User,
} from 'lucide-react';
import { NAV_ITEMS } from '@/lib/nav';
import { logout } from '@/app/login/actions';
import { type UserRole } from '@/types/database';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Users, UserCheck, HeartHandshake, BarChart3, Settings,
};

const SIDEBAR_W_OPEN = 248;
const SIDEBAR_W_COLLAPSED = 64;
const HOVER_DELAY_IN = 150;
const HOVER_DELAY_OUT = 350;

export interface SidebarProps {
  userRole: UserRole;
  userName: string;
  userCode?: string;
  companyName?: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function NavLink({
  href, icon: Icon, label, isActive, isOpen,
}: {
  href: string; icon: React.ElementType; label: string;
  isActive: boolean; isOpen: boolean;
}) {
  return (
    <Link
      href={href}
      title={!isOpen ? label : undefined}
      style={{
        display: 'flex', alignItems: 'center',
        justifyContent: isOpen ? 'flex-start' : 'center',
        gap: 11,
        padding: isOpen ? '10px 12px' : '12px 0',
        margin: '2px 8px',
        borderRadius: 7,
        color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
        background: isActive ? 'rgba(255,255,255,0.13)' : 'transparent',
        textDecoration: 'none',
        fontWeight: isActive ? 600 : 500,
        fontSize: 14.5,
        transition: 'all 0.18s ease',
        borderLeft: isOpen && isActive ? '3px solid rgba(255,255,255,0.7)' : '3px solid transparent',
        overflow: 'hidden', whiteSpace: 'nowrap',
        position: 'relative',
      }}
      onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
      onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <Icon size={isOpen ? 20 : 22} style={{ opacity: isActive ? 1 : 0.8, flexShrink: 0 }} />
      <span style={{
        opacity: isOpen ? 1 : 0,
        maxWidth: isOpen ? 180 : 0,
        overflow: 'hidden',
        transition: 'opacity 0.18s ease, max-width 0.22s ease',
        letterSpacing: '0.01em',
      }}>
        {label}
      </span>
      {isOpen && isActive && (
        <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.45, flexShrink: 0 }} />
      )}
    </Link>
  );
}

export default function Sidebar({
  userRole, userName, userCode = '',
  companyName = 'Thaco Auto Hà Nội', collapsed, onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const mainItems = NAV_ITEMS.filter((item) => item.roles.includes(userRole));
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [toggleVisible, setToggleVisible] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOpen = !collapsed || hoverExpanded;

  const handleMouseEnter = useCallback(() => {
    setToggleVisible(true);
    if (!collapsed) return;
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    hoverTimerRef.current = setTimeout(() => { setHoverExpanded(true); hoverTimerRef.current = null; }, HOVER_DELAY_IN);
  }, [collapsed]);

  const handleMouseLeave = useCallback(() => {
    setToggleVisible(false);
    if (!collapsed) return;
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    hoverTimerRef.current = setTimeout(() => { setHoverExpanded(false); hoverTimerRef.current = null; }, HOVER_DELAY_OUT);
  }, [collapsed]);

  useEffect(() => {
    setHoverExpanded(false);
    return () => {
      if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    };
  }, [collapsed]);

  const currentW = isOpen ? SIDEBAR_W_OPEN : SIDEBAR_W_COLLAPSED;

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        width: collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_OPEN,
        minWidth: collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_OPEN,
        height: '100%',
        position: 'relative',
        flexShrink: 0,
        zIndex: 200,
        transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <div
        style={{
          background: 'var(--sidebar-bg)',
          position: collapsed && hoverExpanded ? 'absolute' : 'relative',
          top: 0, left: 0,
          width: currentW,
          height: '100%',
          display: 'flex', flexDirection: 'column',
          overflowX: 'hidden', overflowY: 'hidden',
          color: '#e2e8f0',
          borderRight: '1px solid rgba(0,0,0,0.18)',
          boxShadow: collapsed && hoverExpanded
            ? '6px 0 28px rgba(0,0,0,0.22)'
            : !collapsed ? '2px 0 12px rgba(0,0,0,0.12)' : 'none',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), box-shadow 0.25s ease',
          willChange: 'width',
          zIndex: 201,
        }}
      >
        {/* Brand header */}
        <div style={{
          minHeight: 56,
          padding: isOpen ? '0 16px' : '0',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0, overflow: 'hidden',
          transition: 'padding 0.2s ease',
        }}>
          <img
            src="https://thacoautohanoi.vn/storage/logo/header-website.webp"
            alt="Thaco Auto Logo"
            style={{
              height: isOpen ? 24 : 0,
              opacity: isOpen ? 1 : 0,
              objectFit: 'contain',
              flexShrink: 0,
              transition: 'height 0.2s ease, opacity 0.2s ease',
            }}
          />
          <div style={{
            overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'center',
            opacity: isOpen ? 1 : 0,
            maxWidth: isOpen ? 200 : 0,
            marginTop: isOpen ? 6 : 0,
            transition: 'opacity 0.2s ease, max-width 0.22s ease, margin 0.2s ease',
          }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#ffffff', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              {companyName}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav
          style={{
            flex: 1,
            padding: '8px 0',
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
            msOverflowStyle: 'none' as React.CSSProperties['msOverflowStyle'],
          }}
        >
          {mainItems.map((item) => {
            const isActive = !!pathname?.startsWith(item.href);
            const IconComponent = ICON_MAP[item.icon] ?? LayoutDashboard;
            return (
              <NavLink
                key={item.href}
                href={item.href}
                icon={IconComponent}
                label={item.label}
                isActive={isActive}
                isOpen={isOpen}
              />
            );
          })}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '6px 10px 4px' }} />
        </nav>

        {/* User panel (avatar + Cài đặt) */}
        <UserPanel userName={userName} userCode={userCode} userRole={userRole} isOpen={isOpen} />
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggleCollapse}
        title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
        style={{
          position: 'absolute',
          top: '50%',
          right: -12,
          transform: `translateY(-50%) ${toggleVisible ? 'scale(1)' : 'scale(0.7)'}`,
          opacity: toggleVisible ? 1 : 0,
          width: 24, height: 24, borderRadius: '50%',
          background: '#004B9B',
          border: '2px solid rgba(255,255,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#ffffff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          transition: 'opacity 0.2s ease, transform 0.2s cubic-bezier(0.34,1.56,0.64,1), background 0.15s ease',
          zIndex: 300,
          pointerEvents: toggleVisible ? 'auto' : 'none',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#0060c7'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#004B9B'; }}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>
    </aside>
  );
}

function UserPanel({ userName, userCode, userRole, isOpen }: {
  userName: string; userCode: string; userRole: UserRole; isOpen: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = userName.split(' ').map(w => w[0]).join('').slice(-2).toUpperCase();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const navigate = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  const handleSignOut = async () => {
    setMenuOpen(false);
    await logout();
  };

  return (
    <div ref={panelRef} style={{ position: 'relative', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      {menuOpen && (
        <div className="dropdown-panel" style={{
          position: 'absolute', bottom: '100%',
          left: isOpen ? 8 : 4, right: isOpen ? 8 : 4, minWidth: 180,
          overflow: 'hidden', zIndex: 300, marginBottom: 6,
        }}>
          <div className="dropdown-header" style={{ padding: '10px 14px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{userName}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>{userCode}</div>
          </div>
          <MenuButton icon={<User size={13} />} label="Hồ sơ cá nhân" onClick={() => navigate('/settings/profile')} />
          <MenuButton icon={<Key size={13} />} label="Đổi mật khẩu" onClick={() => navigate('/settings/profile#password')} />
          {userRole === 'admin' && (
            <MenuButton icon={<Settings size={13} />} label="Cài đặt hệ thống" onClick={() => navigate('/settings')} />
          )}
          <div style={{ height: 1, background: 'var(--color-border-light)', margin: '2px 0' }} />
          <MenuButton icon={<LogOut size={13} />} label="Đăng xuất" danger onClick={handleSignOut} />
        </div>
      )}
      <button
        onClick={() => setMenuOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: isOpen ? 'flex-start' : 'center',
          gap: isOpen ? 9 : 0,
          padding: isOpen ? '10px 12px' : '10px 0',
          background: menuOpen ? 'rgba(255,255,255,0.09)' : 'transparent',
          border: 'none', cursor: 'pointer', color: '#ffffff',
          transition: 'background 0.15s ease', overflow: 'hidden', whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { if (!menuOpen) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
        onMouseLeave={(e) => { if (!menuOpen) (e.currentTarget as HTMLElement).style.background = menuOpen ? 'rgba(255,255,255,0.09)' : 'transparent'; }}
      >
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: '#ffffff',
          flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.22)',
        }}>
          {initials}
        </div>
        <div style={{
          opacity: isOpen ? 1 : 0,
          maxWidth: isOpen ? 180 : 0,
          overflow: 'hidden', textAlign: 'left',
          transition: 'opacity 0.18s ease, max-width 0.22s ease',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userCode}</div>
        </div>
      </button>
    </div>
  );
}

function MenuButton({ icon, label, danger, onClick }: { icon: React.ReactNode; label: string; danger?: boolean; onClick?: () => void; }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 14px', background: 'transparent', border: 'none',
        cursor: 'pointer', fontSize: 13, color: danger ? 'var(--color-danger)' : 'var(--color-text-secondary)',
        textAlign: 'left', transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = danger ? 'var(--color-danger-bg)' : 'var(--color-surface-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{ color: danger ? 'var(--color-danger)' : 'var(--color-text-muted)', display: 'flex' }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
