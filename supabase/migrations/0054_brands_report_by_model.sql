-- 0054_brands_report_by_model.sql
-- Cờ đánh dấu thương hiệu tách chi tiết báo cáo theo DÒNG XE thay vì theo thương hiệu.
-- brands là master TOÀN CỤC (không có company_id) → cột company-agnostic, không rủi ro rò chéo tenant.
ALTER TABLE crm_thacoauto.brands
  ADD COLUMN IF NOT EXISTS report_by_model boolean NOT NULL DEFAULT false;

-- Bật cho thương hiệu Tải Bus (thương hiệu "ô" gộp nhiều dòng xe).
UPDATE crm_thacoauto.brands SET report_by_model = true WHERE name = 'Tải Bus';

NOTIFY pgrst, 'reload schema';
