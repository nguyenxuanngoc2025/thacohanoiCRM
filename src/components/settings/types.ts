// Kiểu dữ liệu dùng chung cho các panel Cài đặt

export interface ShowroomRow {
  id: string;
  name: string;
  code: string | null;
  // Showroom là địa điểm bán nhiều thương hiệu → danh sách brand_id qua bảng junction showroom_brands.
  brand_ids: string[];
}

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
}

export interface ModelRow {
  id: string;
  brand_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

// Phòng bán hàng (lớp giữa Showroom ↔ TVBH). Mỗi phòng cố định 1 thương hiệu.
export interface SalesTeamRow {
  id: string;
  showroom_id: string;
  brand_id: string;
  name: string;
  head_user_id: string | null;
  is_default: boolean;
  // Trọng số phân bổ theo kênh: { facebook: 2, '*': 1, ... }
  allocations: Record<string, number>;
}

export interface ChannelRow {
  id: string;
  page_name: string | null;
  platform: string | null;
  page_id: string | null;
  // showroom_id = anchor (mặc định); 1 kênh có thể phục vụ nhiều showroom qua junction channel_account_showrooms.
  showroom_id: string | null;
  showroom_ids: string[];
  brand_id: string | null;
  campaign: string | null;
  is_active: boolean;
}

export interface AssignmentRuleRow {
  id: string;
  showroom_id: string | null;
  strategy: 'least_loaded' | 'specific_user';
  specific_user_id: string | null;
  is_active: boolean;
  priority: number;
}

export interface SlaRow {
  id: string;
  round: number;
  first_response_hours: number;
  follow_up_hours: number;
  is_active: boolean;
}

export interface NotifChannelRow {
  id: string;
  channel: 'zalo' | 'telegram';
  name: string;
  target: string | null;
  events: string[];
  is_active: boolean;
  showroom_id: string | null;
  scope: 'showroom' | 'management';
}

export interface LeadLogRow {
  id: string;
  lead_id: string;
  user_id: string | null;
  type: 'note' | 'status_change' | 'contact' | 'system';
  content: string | null;
  old_status: string | null;
  new_status: string | null;
  created_at: string;
}
