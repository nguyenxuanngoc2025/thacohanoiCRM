-- CRM THACO Auto — cột bật/tắt showroom theo hạn mức (chỉ platform_owner ghi qua API).
-- Mặc định true → mọi showroom hiện có đều active ("chờ chỉnh tay"). RLS showrooms giữ OFF
-- (master catalog, ghi qua API guard) nên không thêm policy.
ALTER TABLE crm_thacoauto.showrooms
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
