-- 0030: lead độc lập theo công ty — đổi chống trùng từ (phone, brand_id) toàn nền tảng
-- sang (company_id, phone, brand_id). Cùng 1 SĐT + thương hiệu ở 2 công ty khác nhau
-- là 2 lead riêng biệt (mỗi công ty quản lý lead của mình độc lập).
-- An toàn dữ liệu cũ: ràng buộc cũ chặt hơn (không có company_id) nên mọi dòng hiện có
-- đã unique trên (company_id, phone, brand_id) — thêm ràng buộc mới không thể vi phạm.

ALTER TABLE crm_thacoauto.leads
  DROP CONSTRAINT IF EXISTS leads_phone_brand_id_key;

ALTER TABLE crm_thacoauto.leads
  ADD CONSTRAINT leads_company_phone_brand_key UNIQUE (company_id, phone, brand_id);

-- PostgREST nạp lại schema cache.
NOTIFY pgrst, 'reload schema';
