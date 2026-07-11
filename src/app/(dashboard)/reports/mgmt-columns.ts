import type { GroupRow, Kpis } from '@/lib/reports';

/** Các cột chỉ số có thể bật/tắt + đổi thứ tự trong bảng quản trị. */
export type MgmtColKey =
  | 'leads' | 'share' | 'contacted' | 'contactRate' | 'interested' | 'following'
  | 'won' | 'winRate' | 'fail' | 'failRate' | 'overdue'
  | 'b10On' | 'b10Rate' | 'b10Interested' | 'b10Following' | 'b10Won' | 'b10Loai';

export interface MgmtColumn {
  key: MgmtColKey;
  label: string;
  color: string;      // màu chữ khi giá trị > 0
  pct?: boolean;      // hiển thị dạng X.X%
  bold?: boolean;     // in đậm
  keepColor?: boolean; // không xám khi = 0 (cột Tổng lead)
  b10?: boolean;      // chỉ hiện khi công ty bật đối soát B10
  get: (r: GroupRow) => number;
  total: (t: Kpis) => number;
}

export const MGMT_COLUMNS: MgmtColumn[] = [
  { key: 'leads',        label: 'Tổng lead',  color: '#1e293b', bold: true, keepColor: true, get: (r) => r.leads,        total: (t) => t.total },
  { key: 'share',        label: 'Tỷ trọng',   color: '#64748b', pct: true,                    get: (r) => r.share,        total: () => 100 },
  { key: 'contacted',    label: 'Đã LH',      color: '#1d4ed8',                               get: (r) => r.contacted,    total: (t) => t.contacted },
  { key: 'contactRate',  label: '%LH',        color: '#1d4ed8', pct: true,                    get: (r) => r.contactRate,  total: (t) => t.contactRate },
  { key: 'interested',   label: 'KHQT',       color: '#0891b2',                               get: (r) => r.interested,   total: (t) => t.interested },
  { key: 'following',    label: 'GDTD',       color: '#b45309',                               get: (r) => r.following,    total: (t) => t.following },
  { key: 'won',          label: 'KHĐ',        color: '#047857', bold: true,                   get: (r) => r.won,          total: (t) => t.won },
  { key: 'winRate',      label: '%chốt',      color: '#047857', pct: true, bold: true,        get: (r) => r.winRate,      total: (t) => t.winRate },
  { key: 'fail',         label: 'Loại',       color: '#be123c',                               get: (r) => r.fail,         total: (t) => t.fail },
  { key: 'failRate',     label: '%Loại',      color: '#be123c', pct: true,                    get: (r) => r.failRate,     total: (t) => t.failRate },
  { key: 'overdue',      label: 'Quá hạn',    color: '#be123c',                               get: (r) => r.overdue,      total: (t) => t.overdue },
  { key: 'b10On',        label: 'Đã lên B10', color: 'var(--color-brand)', bold: true, b10: true,        get: (r) => r.b10On,        total: (t) => t.b10On },
  { key: 'b10Rate',      label: '% B10',      color: 'var(--color-brand)', pct: true, b10: true,         get: (r) => r.b10Rate,      total: (t) => t.b10Rate },
  { key: 'b10Interested', label: 'B10 KHQT',  color: '#0891b2', b10: true,                    get: (r) => r.b10Interested, total: (t) => t.b10Interested },
  { key: 'b10Following', label: 'B10 GDTD',   color: '#b45309', b10: true,                    get: (r) => r.b10Following, total: (t) => t.b10Following },
  { key: 'b10Won',       label: 'B10 KHĐ',    color: '#047857', b10: true,                    get: (r) => r.b10Won,       total: (t) => t.b10Won },
  { key: 'b10Loai',      label: 'B10 Loại',   color: '#be123c', b10: true,                    get: (r) => r.b10Loai,      total: (t) => t.b10Loai },
];

export const MGMT_COL_MAP = Object.fromEntries(MGMT_COLUMNS.map((c) => [c.key, c])) as Record<MgmtColKey, MgmtColumn>;

/** Thứ tự mặc định (visible trước, cột bổ sung ẩn sau) — giữ nguyên giao diện hiện tại. */
export const MGMT_DEFAULT_ORDER: MgmtColKey[] = [
  'leads', 'contacted', 'interested', 'following', 'won', 'winRate', 'overdue', 'b10On', 'b10Rate',
  'share', 'contactRate', 'fail', 'failRate', 'b10Interested', 'b10Following', 'b10Won', 'b10Loai',
];

/** Cột ẩn mặc định (bổ sung — user tự bật khi cần). */
export const MGMT_DEFAULT_HIDDEN: MgmtColKey[] = [
  'share', 'contactRate', 'fail', 'failRate', 'b10Interested', 'b10Following', 'b10Won', 'b10Loai',
];

export const MGMT_HIDDEN_KEY = 'reports.mgmt.hiddenCols';
export const MGMT_ORDER_KEY = 'reports.mgmt.colOrder';
