'use client';

import { Building2, CheckCircle2, User } from 'lucide-react';
import { type UserRole } from '@/types/database';

export interface StatusBarProps {
  role: UserRole;
  companyName: string;
  userName: string;
}

export default function StatusBar({ companyName, userName }: StatusBarProps) {
  return (
    <div className="status-bar">
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>
        Phát triển bởi <span style={{ fontWeight: 700, color: '#4b5563' }}>Newtab</span>
      </span>
      <div style={{ flex: 1 }} />

      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#111827' }}>
        <User size={12} style={{ color: '#4b5563' }} />
        {userName}
      </span>

      <div className="status-sep" />

      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#4b5563', fontWeight: 500 }}>
        <CheckCircle2 size={10} style={{ color: '#16a34a' }} />
        Hệ thống hoạt động
      </span>

      <div className="status-sep" />

      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#111827' }}>
        <Building2 size={12} style={{ color: '#4b5563' }} />
        {companyName}
      </span>
    </div>
  );
}
