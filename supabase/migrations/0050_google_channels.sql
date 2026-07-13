-- 0050: Tách Nguồn Google thành nhiều Chi tiết kênh (giống Facebook).
-- Trước: Google chỉ 1 dòng builtin value='Google (gọi hotline)'.
-- Sau: Nguồn "Google" gồm Hotline (builtin, quy lead cũ về) + Form web + Zalo OA (thêm được/bớt được).
SET search_path TO crm_thacoauto, public;

-- 1) Đổi tên Nguồn thành "Google" cho mọi dòng platform_key='google'.
UPDATE crm_thacoauto.lead_source_channels
  SET platform_name = 'Google'
  WHERE platform_key = 'google';

-- 2) Biến dòng builtin cũ thành kênh "Hotline" (value chuẩn google_hotline).
UPDATE crm_thacoauto.lead_source_channels
  SET value = 'google_hotline', label = 'Hotline'
  WHERE platform_key = 'google' AND value = 'Google (gọi hotline)';

-- 3) Quy lead Google cũ về kênh Hotline.
UPDATE crm_thacoauto.leads
  SET source = 'google_hotline'
  WHERE source = 'Google (gọi hotline)';

-- 4) Thêm 2 chi tiết kênh mới (không builtin → chủ nền tảng sửa/xoá được).
INSERT INTO crm_thacoauto.lead_source_channels
  (platform_key, platform_name, value, label, is_builtin, is_active, digital, sort_order)
VALUES
  ('google', 'Google', 'google_form_web', 'Form web', false, true, true, 51),
  ('google', 'Google', 'google_zalo_oa',  'Zalo OA',  false, true, true, 52)
ON CONFLICT (value) DO NOTHING;

NOTIFY pgrst, 'reload schema';
