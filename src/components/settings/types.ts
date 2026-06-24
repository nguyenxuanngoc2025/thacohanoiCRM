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

export interface ChannelRow {
  id: string;
  page_name: string | null;
  platform: string | null;
  page_id: string | null;
  showroom_id: string | null;
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
