-- 0058: Index hiệu năng cho bảng leads khi data phình theo thời gian.
--
-- BỐI CẢNH: app đa công ty, data lead tăng ~20-50/ngày/công ty. Trang /leads, /assign,
-- /reports và cron nhắc SLA quét bảng leads liên tục. Bảng hiện chỉ có index trên
-- assigned_to, sales_team_id, showroom_id + unique (company_id, phone, brand_id). Các
-- truy vấn NÓNG dưới đây chưa có index phù hợp → seq scan khi bảng lớn:
--   • /leads + /reports: lọc theo company_id, sắp created_at DESC (danh sách + tổng hợp).
--   • cron reminders: quét next_contact_at <= now (nhắc quá hạn) toàn tenant mỗi 10'.
--   • lọc theo status (list filter + cron 'Chưa LH được' / status IS NULL).
--
-- GIẢI PHÁP: 3 btree index. Idempotent (IF NOT EXISTS).

SET search_path TO crm_thacoauto, public;

-- Danh sách lead + báo cáo: lọc công ty, sắp mới nhất trước.
CREATE INDEX IF NOT EXISTS idx_leads_company_created
  ON crm_thacoauto.leads (company_id, created_at DESC);

-- Cron nhắc SLA: quét lead tới/quá hạn liên hệ.
CREATE INDEX IF NOT EXISTS idx_leads_next_contact
  ON crm_thacoauto.leads (next_contact_at);

-- Lọc theo trạng thái (bộ lọc bảng + cron theo status).
CREATE INDEX IF NOT EXISTS idx_leads_status
  ON crm_thacoauto.leads (status);
