export type UserRole =
  | 'platform_owner' // Chủ nền tảng (company_id = NULL), quản trị mọi công ty
  | 'admin'         // Quản trị cấp công ty
  | 'gd_cty'        // Tổng Giám đốc Công ty
  | 'mkt_cty'       // Marketing Công ty
  | 'gd_brand'      // Giám đốc Thương hiệu
  | 'mkt_brand'     // Marketing Thương hiệu
  | 'tp_brand'      // TP Kinh doanh Thương hiệu
  | 'gd_showroom'   // Giám đốc Showroom
  | 'mkt_showroom'  // Marketing Showroom
  | 'tp_showroom'   // TP Bán hàng (showroom)
  | 'tp_phong'      // TP Bán hàng (phòng): chỉ phòng mình
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
