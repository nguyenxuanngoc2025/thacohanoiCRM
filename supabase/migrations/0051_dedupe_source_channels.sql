-- 0051: Gọn danh mục Nguồn — bỏ trùng lặp.
-- (1) Xoá Nguồn "Google Sheet" khỏi danh mục PHÂN LOẠI (chỉ là kênh trung chuyển,
--     0 lead dùng). KHÔNG đụng connector channel_accounts.platform='google_sheet'
--     (chức năng hút lead từ sheet vẫn nguyên).
-- (2) Đổi kênh "Zalo OA" dưới Nguồn Google → "Zalo" để không trùng tên Nguồn "Zalo OA".
SET search_path TO crm_thacoauto, public;

DELETE FROM crm_thacoauto.lead_source_channels WHERE value = 'google_sheet';

UPDATE crm_thacoauto.lead_source_channels
  SET label = 'Zalo'
  WHERE value = 'google_zalo_oa';

NOTIFY pgrst, 'reload schema';
