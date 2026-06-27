export type UserRole =
  | 'platform_owner' // Chủ nền tảng (company_id = NULL), quản trị mọi công ty — ẩn khỏi UI tạo user
  | 'admin'         // Quản trị cấp công ty
  | 'gd_cty'        // Tổng Giám đốc Công ty
  | 'mkt_cty'       // TP/PP Marketing Công ty
  | 'digital_mkt'   // Digital Marketing (quyền tương đương TP/PP Marketing Công ty)
  | 'gd_brand'      // Giám đốc Thương hiệu (nhiều thương hiệu)
  | 'mkt_brand'     // Marketing Thương hiệu (nhiều thương hiệu)
  | 'tp_brand'      // TP/PP Kinh doanh Thương hiệu (nhiều thương hiệu)
  | 'gd_showroom'   // Giám đốc Showroom (nhiều showroom)
  | 'mkt_showroom'  // Marketing Showroom (nhiều showroom)
  | 'tp_phong'      // Trưởng phòng bán hàng: chỉ phòng mình
  | 'tvbh';         // Tư vấn bán hàng
export type LeadStatus = 'KHQT' | 'GDTD' | 'KHĐ' | 'Chưa LH được' | 'Fail';

export interface IngestPayload {
  page_id: string;
  phone_raw: string | null;
  full_name?: string | null;
  source?: string | null;
  fb_lead_id?: string | null;
  external_payload?: Record<string, unknown> | null;
  intent_text?: string; // văn bản gom để dò dòng xe (tuỳ kênh)
}

export interface IngestResult {
  ok: boolean;
  leadId?: string;
  deduped?: boolean;
  reason?: string;
}
