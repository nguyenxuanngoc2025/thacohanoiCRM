export type UserRole =
  | 'admin'         // Quản trị hệ thống (chủ nền tảng)
  | 'gd_cty'        // Tổng Giám đốc Công ty
  | 'mkt_cty'       // Marketing Công ty
  | 'gd_brand'      // Giám đốc Thương hiệu
  | 'mkt_brand'     // Marketing Thương hiệu
  | 'tp_brand'      // TP Kinh doanh Thương hiệu
  | 'gd_showroom'   // Giám đốc Showroom
  | 'mkt_showroom'  // Marketing Showroom
  | 'tp_showroom'   // TP Bán hàng (showroom)
  | 'tvbh';         // Tư vấn bán hàng
export type LeadStatus = 'KHQT' | 'GDTD' | 'KHĐ' | 'Chưa LH được' | 'Fail';

export interface IngestPayload {
  page_id: string;
  phone_raw: string | null;
  full_name?: string | null;
  source?: string | null;
  fb_lead_id?: string | null;
  external_payload?: Record<string, unknown> | null;
}

export interface IngestResult {
  ok: boolean;
  leadId?: string;
  deduped?: boolean;
  reason?: string;
}
