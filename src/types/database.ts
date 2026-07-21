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
  | 'tp_phong'      // Trưởng phòng bán hàng: chỉ phòng mình (quản lý, KHÔNG bán)
  | 'tn'            // Trưởng nhóm bán hàng: như tp_phong (phạm vi phòng) NHƯNG cũng bán → nhận lead
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
  model_id?: string | null; // dòng xe chỉ định sẵn (Google Sheet gán cố định/theo cột) — ưu tiên hơn intent_text
  // Ghi đè thương hiệu/showroom cho lead (Google Sheet cấu hình riêng từng tab).
  // Khi CÓ: dùng thay cho giá trị suy từ channel ở mọi bước phụ thuộc hãng/showroom.
  // Khi KHÔNG (FB webhook, nguồn khác): giữ nguyên hành vi cũ (suy từ channel).
  brand_id?: string | null;
  showroom_ids?: string[] | null;
  silent_dedup?: boolean; // true = không ghi lead_logs khi trùng (Google Sheet quét lại toàn bộ mỗi lần → tránh spam log)
  suppress_notify?: boolean; // true = KHÔNG đẩy thông báo Zalo (dùng khi backfill lead lịch sử — tránh spam nhóm)
  created_at_override?: string; // ISO — đặt đúng thời điểm gốc từ nguồn (backfill FB time_created) thay vì now()
}

export interface IngestResult {
  ok: boolean;
  leadId?: string;
  deduped?: boolean;
  reason?: string;
}
