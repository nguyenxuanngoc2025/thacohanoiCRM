import { type UserRole } from '@/types/database';

const ALL: UserRole[] = ['admin', 'manager', 'tvbh'];
const MGR: UserRole[] = ['admin', 'manager'];

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: UserRole[];
}

// Menu chính sidebar — công cụ Marketing theo dõi lead. Cài đặt nằm trong avatar.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Lead', href: '/leads', icon: 'Users', roles: ALL },
  { label: 'Phân giao', href: '/assign', icon: 'UserCheck', roles: MGR },
  { label: 'Báo cáo', href: '/reports', icon: 'BarChart3', roles: MGR },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Quản trị',
  manager: 'Quản lý',
  tvbh: 'TVBH',
};

// ─── Metadata vai trò (cho trang Quản lý tài khoản & phân quyền) ───────────────

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Quản trị toàn công ty',
  manager: 'Quản lý 1 showroom',
  tvbh: 'Tư vấn bán hàng',
};

export const ROLE_SCOPE: Record<UserRole, string> = {
  admin: 'Toàn công ty — mọi showroom & lead',
  manager: 'Showroom — toàn bộ lead của showroom được gán',
  tvbh: 'Cá nhân — chỉ lead được giao cho mình',
};

export const ROLE_CAN: Record<UserRole, string[]> = {
  admin: ['Quản lý nhân sự (thêm/sửa/xoá)', 'Xem toàn bộ lead mọi showroom', 'Cấu hình kênh thu lead', 'Xem báo cáo toàn công ty'],
  manager: ['Xem toàn bộ lead của showroom', 'Phân giao lead cho TVBH', 'Xem báo cáo showroom'],
  tvbh: ['Xem & chăm sóc lead được giao', 'Cập nhật trạng thái lead', 'Ghi nhật ký chăm sóc'],
};

export const ROLE_CANNOT: Record<UserRole, string[]> = {
  admin: [],
  manager: ['Quản lý nhân sự công ty', 'Xem lead showroom khác'],
  tvbh: ['Xem lead của người khác', 'Phân giao lead', 'Quản lý nhân sự'],
};

export const ROLE_NEEDS: Record<UserRole, string> = {
  admin: 'Không cần gán showroom (toàn công ty)',
  manager: 'Bắt buộc gán 1 showroom',
  tvbh: 'Bắt buộc gán 1 showroom',
};

export const ROLE_COLOR: Record<UserRole, { bg: string; text: string; border: string }> = {
  admin:   { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  manager: { bg: '#e6f0fa', text: '#004B9B', border: '#bfdbfe' },
  tvbh:    { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
};

/** TVBH & quản lý bắt buộc gán showroom; admin toàn công ty (không cần). */
export function roleNeedsShowroom(role: UserRole): boolean {
  return role === 'manager' || role === 'tvbh';
}
