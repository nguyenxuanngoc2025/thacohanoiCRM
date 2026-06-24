export type LeadStatus = 'KHQT' | 'GDTD' | 'KHĐ' | 'Chưa LH được' | 'Fail';

export const STATUS_LABEL: Record<LeadStatus, string> = {
  KHQT: 'Khách quan tâm',
  GDTD: 'Giao dịch theo dõi',
  'KHĐ': 'Ký hợp đồng',
  'Chưa LH được': 'Chưa liên hệ được',
  Fail: 'Loại',
};

export const STATUS_OPTIONS: { code: LeadStatus; label: string; color: string; bg: string }[] = [
  { code: 'KHQT', label: STATUS_LABEL.KHQT, color: '#1d4ed8', bg: '#eff6ff' },
  { code: 'GDTD', label: STATUS_LABEL.GDTD, color: '#b45309', bg: '#fffbeb' },
  { code: 'KHĐ', label: STATUS_LABEL['KHĐ'], color: '#047857', bg: '#ecfdf5' },
  { code: 'Chưa LH được', label: STATUS_LABEL['Chưa LH được'], color: '#475569', bg: '#f8fafc' },
  { code: 'Fail', label: STATUS_LABEL.Fail, color: '#be123c', bg: '#fff1f2' },
];

/** Lý do khi phân loại Fail (bắt buộc chọn). 'Khác' cho nhập tay. */
export const FAIL_REASONS = [
  'Sai số / không liên lạc được',
  'Không có nhu cầu',
  'Đã mua xe nơi khác',
  'Chỉ khảo giá, không mua',
  'Ngoài khả năng tài chính',
  'Trùng / spam',
  'Khác',
] as const;

/** Cờ đã/chưa liên hệ suy từ cột last_contact_at (không thêm cột DB). */
export function isContacted(lastContactAt: string | null): boolean {
  return lastContactAt != null;
}
