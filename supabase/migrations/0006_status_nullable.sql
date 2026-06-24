-- 0006_status_nullable.sql
-- Phân loại (status) mặc định TRỐNG: NULL = chưa phân loại.
-- TVBH chỉ phân loại sau khi đã liên hệ. Bỏ DEFAULT 'KHQT' + bỏ NOT NULL.
-- CHECK constraint cũ vẫn pass với NULL nên giữ nguyên.

SET search_path TO crm_thacoauto, public;

ALTER TABLE crm_thacoauto.leads ALTER COLUMN status DROP DEFAULT;
ALTER TABLE crm_thacoauto.leads ALTER COLUMN status DROP NOT NULL;

-- Reset phân loại của các lead CHƯA liên hệ về trống cho đúng nghiệp vụ
UPDATE crm_thacoauto.leads SET status = NULL WHERE last_contact_at IS NULL;
