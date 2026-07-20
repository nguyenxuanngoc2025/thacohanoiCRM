'use client';

import React, { useState } from 'react';
import {
  Users, ShieldCheck, Building2, Plug, ListChecks, GitBranch, Bell, ScrollText, Boxes, Activity,
} from 'lucide-react';
import AccountsManager, { RoleReference, type StaffRow, type ShowroomOption, type SalesTeamOption } from './AccountsManager';
import IntegrationsCatalog from './IntegrationsCatalog';
import OrgManager from './OrgManager';
import PipelineReference from './PipelineReference';
import AssignmentManager from './AssignmentManager';
import NotificationsManager from './NotificationsManager';
import ActivityLog from './ActivityLog';
import SalesTeamsManager from './SalesTeamsManager';
import SystemHealthPanel from './SystemHealthPanel';
import type {
  ShowroomRow, BrandRow, ModelRow, ChannelRow, AssignmentRuleRow, SlaRow, NotifChannelRow, LeadLogRow, SalesTeamRow, RosterRow,
} from './types';

export type { ChannelRow };

type ItemKey =
  | 'accounts' | 'roles' | 'org' | 'teams'
  | 'integrations'
  | 'pipeline' | 'assignment'
  | 'health' | 'notifications' | 'audit';

interface NavItem { key: ItemKey; label: string; icon: React.ElementType; }
interface NavGroup { title: string; items: NavItem[]; }

const NAV: NavGroup[] = [
  {
    title: 'Tổ chức',
    items: [
      { key: 'accounts', label: 'Tài khoản', icon: Users },
      { key: 'roles', label: 'Phân quyền', icon: ShieldCheck },
      { key: 'org', label: 'Showroom · Thương hiệu', icon: Building2 },
      { key: 'teams', label: 'Phòng bán hàng', icon: Boxes },
    ],
  },
  {
    title: 'Tích hợp & Nguồn lead',
    items: [
      { key: 'integrations', label: 'Tích hợp', icon: Plug },
    ],
  },
  {
    title: 'Cấu hình nghiệp vụ',
    items: [
      { key: 'pipeline', label: 'Trạng thái lead', icon: ListChecks },
      { key: 'assignment', label: 'Phân giao · Thời hạn liên hệ', icon: GitBranch },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { key: 'health', label: 'Tình trạng hệ thống', icon: Activity },
      { key: 'notifications', label: 'Thông báo', icon: Bell },
      { key: 'audit', label: 'Nhật ký hoạt động', icon: ScrollText },
    ],
  },
];

export default function SettingsClient({
  staff, showrooms, brands, models, salesTeams, companyId, currentUserId, channels,
  assignmentRules, slaConfig, notifChannels, recentLogs, statusCounts,
  fbBusinessId, googleConnected, zaloBotSession, roster,
}: {
  staff: StaffRow[];
  showrooms: ShowroomRow[];
  brands: BrandRow[];
  models: ModelRow[];
  salesTeams: SalesTeamRow[];
  companyId: string;
  currentUserId: string;
  channels: ChannelRow[];
  assignmentRules: AssignmentRuleRow[];
  slaConfig: SlaRow[];
  notifChannels: NotifChannelRow[];
  recentLogs: LeadLogRow[];
  statusCounts: Record<string, number>;
  fbBusinessId: string;
  googleConnected: boolean;
  zaloBotSession: { status: 'connected' | 'disconnected'; displayName: string | null; lastError: string | null };
  roster: RosterRow[];
}) {
  const [active, setActive] = useState<ItemKey>('accounts');
  const showroomOpts: ShowroomOption[] = showrooms;

  // Tên hiển thị phòng cho dropdown tài khoản: "Showroom · Thương hiệu · Tên phòng".
  const teamOpts: SalesTeamOption[] = salesTeams.map((t) => {
    const sr = showrooms.find((s) => s.id === t.showroom_id)?.name ?? 'Showroom';
    const brNames = t.brand_ids.map((id) => brands.find((b) => b.id === id)?.name).filter(Boolean);
    const br = brNames.length ? brNames.join(', ') : 'Chưa gán hãng';
    return { id: t.id, showroom_id: t.showroom_id, brand_ids: t.brand_ids, label: `${sr} · ${br} · ${t.name}` };
  });

  const allItems = NAV.flatMap((g) => g.items);

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-6 items-start">
      {/* Mobile: thanh tab ngang cuộn ngang được (menu dọc không vừa màn hình điện thoại) */}
      <nav
        className="lg:hidden w-full flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {allItems.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap border transition-colors"
              style={{
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--color-brand)' : '#475569',
                background: isActive ? '#e6f0fa' : '#fff',
                borderColor: isActive ? '#bfdbfe' : '#e2e8f0',
              }}
            >
              <Icon size={15} className="shrink-0" />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Desktop: menu dọc */}
      <nav className="hidden lg:block w-60 shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm p-2 sticky top-6">
        {NAV.map((group) => (
          <div key={group.title} className="mb-1.5 last:mb-0">
            <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {group.title}
            </div>
            {group.items.map(({ key, label, icon: Icon }) => {
              const isActive = active === key;
              return (
                <button
                  key={key}
                  onClick={() => setActive(key)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors"
                  style={{
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? 'var(--color-brand)' : '#475569',
                    background: isActive ? '#e6f0fa' : 'transparent',
                  }}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Nội dung */}
      <div className="flex-1 min-w-0 w-full">
        {active === 'accounts' && (
          <AccountsManager staff={staff} showrooms={showroomOpts} brands={brands} salesTeams={teamOpts} companyId={companyId} currentUserId={currentUserId} />
        )}
        {active === 'roles' && <RoleReference />}
        {active === 'org' && <OrgManager showrooms={showrooms} brands={brands} models={models} />}
        {active === 'teams' && (
          <SalesTeamsManager salesTeams={salesTeams} showrooms={showrooms} brands={brands} staff={staff} />
        )}
        {active === 'integrations' && (
          <IntegrationsCatalog channels={channels} showrooms={showrooms} brands={brands} models={models} fbBusinessId={fbBusinessId} googleConnected={googleConnected} />
        )}
        {active === 'pipeline' && <PipelineReference counts={statusCounts} />}
        {active === 'assignment' && (
          <AssignmentManager showrooms={showrooms} salesTeams={salesTeams} staff={staff} rules={assignmentRules} sla={slaConfig} companyId={companyId} roster={roster} />
        )}
        {active === 'health' && <SystemHealthPanel />}
        {active === 'notifications' && <NotificationsManager channels={notifChannels} showrooms={showrooms} salesTeams={salesTeams} brands={brands} zaloBotSession={zaloBotSession} />}
        {active === 'audit' && <ActivityLog logs={recentLogs} staff={staff} />}
      </div>
    </div>
  );
}
