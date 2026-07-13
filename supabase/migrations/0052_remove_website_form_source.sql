-- 0052: Bỏ Nguồn "Website form" khỏi danh mục phân loại (user yêu cầu).
-- KHÔNG xoá lead cũ đang mang source='Website form' (giữ nhãn gốc, chỉ rời dropdown chọn nguồn).
SET search_path TO crm_thacoauto, public;

DELETE FROM crm_thacoauto.lead_source_channels WHERE value = 'Website form';

NOTIFY pgrst, 'reload schema';
