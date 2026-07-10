-- 0042: Phòng đa hãng — cho phép sales_teams.brand_id NULL.
-- Bối cảnh: showroom (vd Phạm Văn Đồng) không chia phòng theo thương hiệu mà chia
-- thành nhiều phòng, mỗi phòng bán TẤT CẢ thương hiệu của showroom.
--   brand_id NULL = phòng đa hãng (nhận lead của mọi hãng showroom kinh doanh).
--   brand_id set  = phòng khoá 1 hãng (giữ nguyên hành vi cũ, không phá showroom hiện tại).
-- Lead vẫn giữ brand_id riêng (từ kênh) → báo cáo/RLS theo hãng KHÔNG đổi.
-- Idempotent.

SET search_path TO crm_thacoauto, public;

ALTER TABLE crm_thacoauto.sales_teams ALTER COLUMN brand_id DROP NOT NULL;

-- PostgREST cache tính nullable của cột → nạp lại schema để insert brand_id NULL được.
NOTIFY pgrst, 'reload schema';
