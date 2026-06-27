'use client';

import React, { useState } from 'react';
import {
  Users, ShieldCheck, Building2, Plug, ListChecks, GitBranch, Bell, ScrollText, Boxes,
} from 'lucide-react';
import AccountsManager, { RoleReference, type StaffRow, type ShowroomOption, type SalesTeamOption } from './AccountsManager';
import IntegrationsCatalog from './IntegrationsCatalog';
import OrgManager from './OrgManager';
import PipelineReference from './PipelineReference';
import AssignmentManager from './AssignmentManager';
import NotificationsManager from './NotificationsManager';
import ActivityLog from './ActivityLog';
import SalesTeamsManager from './SalesTeamsManager';
import type {
  ShowroomRow, BrandRow, ModelRow, ChannelRow, AssignmentRuleRow, SlaRow, NotifChannelRow, LeadLogRow, SalesTeamRow, AssignStrategy,
} from './types';

export type { ChannelRow };

type ItemKey =
  | 'accounts' | 'roles' | 'org' | 'teams'
  | 'integrations'
  | 'pipeline' | 'assignment'
  | 'notifications' | 'audit';

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
      { key: 'notifications', label: 'Thông báo', icon: Bell },
      { key: 'audit', label: 'Nhật ký hoạt động', icon: ScrollText },
    ],
  },
];

export default function SettingsClient({
  staff, showrooms, brands, models, salesTeams, companyId, currentUserId, channels,
  assignmentRules, companyShowroomStrategy, slaConfig, notifChannels, recentLogs, statusCounts, canEditCatalog,
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
  companyShowroomStrategy: AssignStrategy;
  slaConfig: SlaRow[];
  notifChannels: NotifChannelRow[];
  recentLogs: LeadLogRow[];
  statusCounts: Record<string, number>;
  canEditCatalog: boolean;
}) {
  const [active, setActive] = useState<ItemKey>('accounts');
  const showroomOpts: ShowroomOption[] = showrooms;

  // Tên hiển thị phòng cho dropdown tài khoản: "Showroom · Thương hiệu · Tên phòng".
  const teamOpts: SalesTeamOption[] = salesTeams.map((t) => {
    const sr = showrooms.find((s) => s.id === t.showroom_id)?.name ?? 'Showroom';
    const br = brands.find((b) => b.id === t.brand_id)?.name ?? 'Thương hiệu';
    return { id: t.id, showroom_id: t.showroom_id, brand_id: t.brand_id, label: `${sr} · ${br} · ${t.name}` };
  });

  return (
    <div className="flex gap-6 items-start">
      {/* Menu dọc */}
      <nav className="w-60 shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm p-2 sticky top-6">
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
                    color: isActive ? '#004B9B' : '#475569',
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
      <div className="flex-1 min-w-0">
        {active === 'accounts' && (
          <AccountsManager staff={staff} showrooms={showroomOpts} brands={brands} salesTeams={teamOpts} companyId={companyId} currentUserId={currentUserId} />
        )}
        {active === 'roles' && <RoleReference />}
        {active === 'org' && <OrgManager showrooms={showrooms} brands={brands} models={models} canEditCatalog={canEditCatalog} />}
        {active === 'teams' && (
          <SalesTeamsManager salesTeams={salesTeams} showrooms={showrooms} brands={brands} staff={staff} channels={channels} />
        )}
        {active === 'integrations' && (
          <IntegrationsCatalog channels={channels} showrooms={showrooms} brands={brands} />
        )}
        {active === 'pipeline' && <PipelineReference counts={statusCounts} />}
        {active === 'assignment' && (
          <AssignmentManager showrooms={showrooms} staff={staff} rules={assignmentRules} sla={slaConfig} companyId={companyId} companyShowroomStrategy={companyShowroomStrategy} />
        )}
        {active === 'notifications' && <NotificationsManager channels={notifChannels} showrooms={showrooms} />}
        {active === 'audit' && <ActivityLog logs={recentLogs} staff={staff} />}
      </div>
    </div>
  );
}
