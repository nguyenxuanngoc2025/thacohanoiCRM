import { ROLE_SCOPE_KIND } from '@/lib/nav';
import { type UserRole } from '@/types/database';
import { type ReportLevel, type Dimension } from '@/lib/reports';

export type ReportTab = 'overview' | 'ranking' | 'management' | 'source' | 'tables';

/** Vai trò → cấp báo cáo (dùng ROLE_SCOPE_KIND; 'assigned' = cá nhân TVBH). */
export function roleToReportLevel(role: UserRole): ReportLevel {
  const kind = ROLE_SCOPE_KIND[role];
  return kind === 'assigned' ? 'personal' : kind as ReportLevel;
}

/** Vai trò marketing (mặc định vào tab Nguồn & Kênh). */
export function isMarketingRole(role: UserRole): boolean {
  return role === 'mkt_cty' || role === 'digital_mkt' || role === 'mkt_brand' || role === 'mkt_showroom';
}

const FULL: ReportTab[] = ['overview', 'ranking', 'management', 'source', 'tables'];
const PERSONAL: ReportTab[] = ['overview', 'source', 'tables'];

/** Tập tab theo cấp: personal ẩn Xếp hạng + Bảng quản trị. */
export function tabsForLevel(level: ReportLevel): ReportTab[] {
  return level === 'personal' ? PERSONAL : FULL;
}

/** Tab mặc định: marketing → source; còn lại → overview. */
export function defaultTab(level: ReportLevel, marketing: boolean): ReportTab {
  return marketing ? 'source' : 'overview';
}

/** Chiều pivot hợp cấp (tab Bảng chi tiết): đơn vị cấp dưới + model/source/status. */
export function dimensionsForLevel(level: ReportLevel): Dimension[] {
  switch (level) {
    case 'company': return ['showroom', 'brand', 'model', 'source', 'status'];
    case 'brand': return ['showroom', 'model', 'source', 'status'];
    case 'showroom': return ['team', 'model', 'source', 'status'];
    case 'team': return ['assignee', 'model', 'source', 'status'];
    case 'personal': return ['model', 'source', 'status'];
  }
}
