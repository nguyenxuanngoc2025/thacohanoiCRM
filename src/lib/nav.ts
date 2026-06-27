import { type UserRole } from '@/types/database';

// ─── Phạm vi xem lead theo vai trò ──────────────────────────────────────────────
export type ViewScope = 'company' | 'brand' | 'showroom' | 'team' | 'assigned';

export const ROLE_SCOPE_KIND: Record<UserRole, ViewScope> = {
  platform_owner: 'company',
  admin: 'company',
  gd_cty: 'company',
  mkt_cty: 'company',
  gd_brand: 'brand',
  mkt_brand: 'brand',
  tp_brand: 'brand',
  gd_showroom: 'showroom',
  mkt_showroom: 'showroom',
  tp_showroom: 'showroom',
  tp_phong: 'team',
  tvbh: 'assigned',
};

// Vai trò "điều hành": được phân giao & thêm lead thủ công (TP/Giám đốc/admin).
// Marketing chỉ xem + báo cáo (không phân giao). TVBH chỉ chăm sóc lead của mình.
export const CAN_ASSIGN = new Set<UserRole>([
  'admin', 'gd_cty', 'gd_brand', 'tp_brand', 'gd_showroom', 'tp_showroom', 'tp_phong',
]);
export const CAN_CREATE_LEAD = CAN_ASSIGN;
// Báo cáo: mọi vai trò trừ TVBH.
export const CAN_VIEW_REPORTS = new Set<UserRole>([
  'admin', 'gd_cty', 'mkt_cty', 'gd_brand', 'mkt_brand', 'tp_brand',
  'gd_showroom', 'mkt_showroom', 'tp_showroom', 'tp_phong',
]);
// Quản trị tài khoản / kênh / cấu hình hệ thống.
export const CAN_MANAGE_STAFF = new Set<UserRole>(['admin']);

const ALL: UserRole[] = [
  'platform_owner', 'admin', 'gd_cty', 'mkt_cty', 'gd_brand', 'mkt_brand', 'tp_brand',
  'gd_showroom', 'mkt_showroom', 'tp_showroom', 'tp_phong', 'tvbh',
];
const ASSIGN: UserRole[] = [...CAN_ASSIGN];
const REPORTS: UserRole[] = [...CAN_VIEW_REPORTS];

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: UserRole[];
}

// Menu chính sidebar — công cụ Marketing theo dõi lead. Cài đặt chỉ admin/chủ nền tảng.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Lead', href: '/leads', icon: 'Users', roles: ALL },
  { label: 'Phân giao', href: '/assign', icon: 'UserCheck', roles: ASSIGN },
  { label: 'Báo cáo', href: '/reports', icon: 'BarChart3', roles: REPORTS },
  { label: 'Cài đặt', href: '/settings', icon: 'Settings', roles: ['admin', 'platform_owner'] },
];

// ─── Danh sách vai trò (đúng thứ tự sơ đồ tổ chức) ─────────────────────────────
export const ALL_ROLES: UserRole[] = ALL;

export const ROLE_LABELS: Record<UserRole, string> = {
  platform_owner: 'Chủ nền tảng',
  admin: 'Quản trị hệ thống',
  gd_cty: 'Tổng Giám đốc Công ty',
  mkt_cty: 'Marketing Công ty',
  gd_brand: 'Giám đốc Thương hiệu',
  mkt_brand: 'Marketing Thương hiệu',
  tp_brand: 'TP Kinh doanh Thương hiệu',
  gd_showroom: 'Giám đốc Showroom',
  mkt_showroom: 'Marketing Showroom',
  tp_showroom: 'TP Bán hàng (Showroom)',
  tp_phong: 'TP Bán hàng (Phòng)',
  tvbh: 'Tư vấn bán hàng',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  platform_owner: 'Quản trị toàn bộ công ty trên nền tảng',
  admin: 'Quản trị nền tảng — toàn quyền',
  gd_cty: 'Điều hành toàn công ty',
  mkt_cty: 'Marketing cấp công ty',
  gd_brand: 'Điều hành 1 thương hiệu',
  mkt_brand: 'Marketing 1 thương hiệu',
  tp_brand: 'Trưởng phòng kinh doanh thương hiệu',
  gd_showroom: 'Điều hành 1 showroom',
  mkt_showroom: 'Marketing 1 showroom',
  tp_showroom: 'Trưởng phòng bán hàng showroom',
  tp_phong: 'Trưởng 1 phòng bán hàng trong showroom',
  tvbh: 'Tư vấn bán hàng',
};

export const ROLE_SCOPE: Record<UserRole, string> = {
  platform_owner: 'Toàn nền tảng — mọi công ty',
  admin: 'Toàn công ty — mọi showroom & lead',
  gd_cty: 'Toàn công ty — mọi showroom & lead',
  mkt_cty: 'Toàn công ty — chỉ xem & báo cáo',
  gd_brand: 'Theo thương hiệu — mọi showroom có thương hiệu đó',
  mkt_brand: 'Theo thương hiệu — chỉ xem & báo cáo',
  tp_brand: 'Theo thương hiệu — mọi showroom có thương hiệu đó',
  gd_showroom: 'Theo showroom — toàn bộ lead của showroom',
  mkt_showroom: 'Theo showroom — chỉ xem & báo cáo',
  tp_showroom: 'Theo showroom — toàn bộ lead của showroom',
  tp_phong: 'Theo phòng — toàn bộ lead của phòng mình',
  tvbh: 'Cá nhân — chỉ lead được giao cho mình',
};

const VIEW_ALL = 'Xem toàn bộ lead trong phạm vi';
const REPORT = 'Xem báo cáo';
const ASSIGN_TXT = 'Phân giao lead cho TVBH';

export const ROLE_CAN: Record<UserRole, string[]> = {
  platform_owner: ['Quản trị mọi công ty', 'Đặt quota & khóa/mở', 'Quản lý hợp đồng/công nợ'],
  admin: ['Quản lý nhân sự (thêm/sửa/xoá)', 'Cấu hình kênh thu lead', VIEW_ALL, ASSIGN_TXT, REPORT],
  gd_cty: [VIEW_ALL + ' (toàn công ty)', ASSIGN_TXT, REPORT],
  mkt_cty: [VIEW_ALL + ' (toàn công ty)', REPORT],
  gd_brand: [VIEW_ALL + ' (thương hiệu)', ASSIGN_TXT, REPORT],
  mkt_brand: [VIEW_ALL + ' (thương hiệu)', REPORT],
  tp_brand: [VIEW_ALL + ' (thương hiệu)', ASSIGN_TXT, REPORT],
  gd_showroom: [VIEW_ALL + ' (showroom)', ASSIGN_TXT, REPORT],
  mkt_showroom: [VIEW_ALL + ' (showroom)', REPORT],
  tp_showroom: [VIEW_ALL + ' (showroom)', ASSIGN_TXT, REPORT],
  tp_phong: [VIEW_ALL + ' (phòng)', ASSIGN_TXT, REPORT],
  tvbh: ['Xem & chăm sóc lead được giao', 'Cập nhật trạng thái lead', 'Ghi nhật ký chăm sóc'],
};

export const ROLE_CANNOT: Record<UserRole, string[]> = {
  platform_owner: [],
  admin: [],
  gd_cty: ['Quản lý nhân sự & cấu hình hệ thống'],
  mkt_cty: ['Phân giao lead', 'Quản lý nhân sự'],
  gd_brand: ['Xem lead thương hiệu khác', 'Quản lý nhân sự'],
  mkt_brand: ['Phân giao lead', 'Xem lead thương hiệu khác'],
  tp_brand: ['Xem lead thương hiệu khác', 'Quản lý nhân sự'],
  gd_showroom: ['Xem lead showroom khác', 'Quản lý nhân sự'],
  mkt_showroom: ['Phân giao lead', 'Xem lead showroom khác'],
  tp_showroom: ['Xem lead showroom khác', 'Quản lý nhân sự'],
  tp_phong: ['Xem lead phòng khác', 'Quản lý nhân sự'],
  tvbh: ['Xem lead của người khác', 'Phân giao lead', 'Quản lý nhân sự'],
};

export const ROLE_NEEDS: Record<UserRole, string> = {
  platform_owner: 'Không thuộc công ty nào',
  admin: 'Không cần gán (toàn công ty)',
  gd_cty: 'Không cần gán (toàn công ty)',
  mkt_cty: 'Không cần gán (toàn công ty)',
  gd_brand: 'Bắt buộc gán 1 thương hiệu',
  mkt_brand: 'Bắt buộc gán 1 thương hiệu',
  tp_brand: 'Bắt buộc gán 1 thương hiệu',
  gd_showroom: 'Bắt buộc gán 1 showroom',
  mkt_showroom: 'Bắt buộc gán 1 showroom',
  tp_showroom: 'Bắt buộc gán 1 showroom',
  tp_phong: 'Bắt buộc gán 1 phòng bán hàng',
  tvbh: 'Bắt buộc gán 1 phòng bán hàng',
};

const C_ADMIN = { bg: '#fef3c7', text: '#92400e', border: '#fde68a' };
const C_BRAND = { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' };
const C_SHOWROOM = { bg: '#e6f0fa', text: '#004B9B', border: '#bfdbfe' };
const C_TVBH = { bg: '#f0fdf4', text: '#166534', border: '#86efac' };

export const ROLE_COLOR: Record<UserRole, { bg: string; text: string; border: string }> = {
  platform_owner: C_ADMIN,
  admin: C_ADMIN,
  gd_cty: C_ADMIN,
  mkt_cty: C_ADMIN,
  gd_brand: C_BRAND,
  mkt_brand: C_BRAND,
  tp_brand: C_BRAND,
  gd_showroom: C_SHOWROOM,
  mkt_showroom: C_SHOWROOM,
  tp_showroom: C_SHOWROOM,
  tp_phong: C_SHOWROOM,
  tvbh: C_TVBH,
};

/** Vai trò cấp showroom bắt buộc gán showroom. */
export function roleNeedsShowroom(role: UserRole): boolean {
  return ROLE_SCOPE_KIND[role] === 'showroom';
}

/** Vai trò cấp thương hiệu bắt buộc gán thương hiệu. */
export function roleNeedsBrand(role: UserRole): boolean {
  return ROLE_SCOPE_KIND[role] === 'brand';
}

/**
 * TVBH & TP Phòng thuộc đúng 1 phòng bán hàng (= showroom + thương hiệu cố định).
 * Showroom + thương hiệu được suy ra từ phòng → form chỉ chọn phòng.
 */
export function roleNeedsSalesTeam(role: UserRole): boolean {
  return role === 'tvbh' || role === 'tp_phong';
}
