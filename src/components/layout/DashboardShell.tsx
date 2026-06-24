'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import StatusBar from '@/components/layout/StatusBar';
import { type UserRole } from '@/types/database';

export interface DashboardShellProps {
  userName: string;
  userRole: UserRole;
  userCode: string;
  companyName: string;
  metrics?: { label: string; value: string | number }[];
  children: React.ReactNode;
}

export default function DashboardShell({
  userName, userRole, userCode, companyName, metrics, children,
}: DashboardShellProps) {
  // Mặc định thu gọn sidebar (auto-hide); ghi nhớ lựa chọn của user qua localStorage.
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar.collapsed');
    if (saved !== null) setCollapsed(saved === '1');
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('sidebar.collapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          userRole={userRole}
          userName={userName}
          userCode={userCode}
          companyName={companyName}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--color-bg)', position: 'relative' }}>
            {children}
          </main>
        </div>
      </div>
      <StatusBar role={userRole} companyName={companyName} metrics={metrics} />
    </div>
  );
}
