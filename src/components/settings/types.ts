// Kiểu dữ liệu dùng chung cho các panel Cài đặt

export type AssignStrategy = 'least_loaded' | 'round_robin' | 'weighted' | 'manual' | 'day_roster';

// 1 dòng lịch trực: ngày dương lịch nào (roster_date 'YYYY-MM-DD') phòng nào (sales_team_id)
// nhận toàn bộ lead của showroom. null = đã tạo dòng nhưng gỡ phòng (coi như chưa đặt).
export interface RosterRow {
  showroom_id: string;
  roster_date: string;
  sales_team_id: string | null;
}

export interface ShowroomRow {
  id: string;
  name: string;
  code: string | null;
  // Showroom là địa điểm bán nhiều thương hiệu → danh sách brand_id qua bảng junction showroom_brands.
  brand_ids: string[];
  // Cách showroom chia lead vào các phòng + % share của showroom (dùng khi công ty chọn theo tỷ lệ).
  team_assign_strategy: AssignStrategy;
  assign_share_pct: number;
  // Tỉnh/khu vực của showroom + từ khoá khác (không dấu/viết tắt) để định tuyến lead theo địa chỉ.
  // Tuỳ chọn — chỉ trang Cài đặt (Google Sheet) cần; các nơi khác dùng ShowroomRow không cần tỉnh.
  province?: string | null;
  province_aliases?: string[];
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
  keywords: string[];
}

// Phòng bán hàng (lớp giữa Showroom ↔ TVBH). Mỗi phòng cố định 1 thương hiệu.
export interface SalesTeamRow {
  id: string;
  showroom_id: string;
  // Danh sách thương hiệu phòng bán (cụ thể). [] = chưa gán hãng → không nhận lead.
  brand_ids: string[];
  name: string;
  head_user_id: string | null;
  is_default: boolean;
  // Cách phòng chia lead cho TVBH + % share của phòng (dùng khi showroom chọn theo tỷ lệ).
  tvbh_assign_strategy: AssignStrategy;
  assign_share_pct: number;
  // (Cũ) Trọng số phân bổ theo kênh — ngừng dùng, giữ để tránh vỡ dữ liệu cũ.
  allocations: Record<string, number>;
}

// Cấu hình Google Sheet (jsonb channel_accounts.config). Các kênh khác để null.
export interface SheetConfig {
  connection_id?: string;
  // Mỗi tab một cấu hình đầy đủ riêng (thương hiệu/showroom/cột/nguồn/dòng xe/mốc thời gian).
  tabs?: import('@/lib/google-sheet-sync').TabCfg[];
  tab?: string | null;
  phone_col?: number;
  name_col?: number | null;
  note_cols?: number[];
  source_mode?: 'fixed' | 'column';
  source_col?: number | null;
  model_mode?: 'auto' | 'fixed' | 'column';
  model_id?: string | null;
  model_col?: number | null;
  // Mốc thời gian: cột chứa thời gian + ngày bắt đầu lấy lead (YYYY-MM-DD) — chống nạp lead cũ.
  date_col?: number | null;
  since?: string | null;
  // Định tuyến theo địa chỉ: cột địa chỉ + tỉnh mặc định khi không nhận ra tỉnh nào.
  address_col?: number | null;
  address_fallback_province?: string | null;
  brand_id?: string | null; showroom_ids?: string[] | null; // cấp-dòng (cấu hình cũ dùng chung mọi tab)
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
  // CẤP 1: cách kênh chia lead vào các showroom + % của từng showroom (showroom_id → %).
  showroom_assign_strategy?: AssignStrategy;
  showroom_shares?: Record<string, number>;
  config?: SheetConfig | null;
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
  // scope='sales' → kênh của 1 phòng bán hàng (sales_team_id). scope='management' → nhóm BLĐ
  // theo showroom (showroom_id) hoặc toàn công ty (showroom_id = null).
  // scope='brand' → nhóm Ban lãnh đạo theo thương hiệu (brand_ids).
  showroom_id: string | null;
  sales_team_id: string | null;
  // Danh sách phòng nhận thông báo (kênh scope='sales'). Mảng rỗng cho scope khác.
  sales_team_ids: string[];
  // Danh sách thương hiệu phụ trách (kênh scope='brand'). Mảng rỗng cho scope khác.
  brand_ids: string[];
  scope: 'sales' | 'management' | 'brand';
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
