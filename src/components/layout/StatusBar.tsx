'use client';

import React from 'react';
import { Building2, CheckCircle2 } from 'lucide-react';
import { ROLE_LABELS, ROLE_COLOR } from '@/lib/nav';
import { type UserRole } from '@/types/database';

export interface StatusBarProps {
  role: UserRole;
  companyName: string;
  metrics?: { label: string; value: string | number }[];
}

export default function StatusBar({ role, companyName, metrics }: StatusBarProps) {
  const c = ROLE_COLOR[role] ?? { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <div className="status-bar">
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>
        Phát triển bởi <span style={{ fontWeight: 700, color: '#4b5563' }}>Newtab Agency</span>
      </span>
      <div style={{ flex: 1 }} />

      {metrics && metrics.length > 0 && (
        <>
          {metrics.map((m, i) => (
            <React.Fragment key={m.label}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#4b5563', fontWeight: 500 }}>
                <span style={{ color: '#9ca3af' }}>{m.label}</span>
                <span style={{ fontWeight: 700, color: '#111827' }}>{m.value}</span>
              </span>
              {i < metrics.length - 1 && <div className="status-sep" />}
            </React.Fragment>
          ))}
          <div className="status-sep" />
        </>
      )}

      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#4b5563', fontWeight: 500 }}>
        <CheckCircle2 size={10} style={{ color: '#16a34a' }} />
        Hệ thống hoạt động
      </span>

      <div className="status-sep" />

      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 7px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
        color: c.text, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 3,
      }}>
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: c.border }} />
        {roleLabel}
      </span>

      <div className="status-sep" />

      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#111827' }}>
        <Building2 size={12} style={{ color: '#4b5563' }} />
        {companyName}
      </span>
    </div>
  );
}
