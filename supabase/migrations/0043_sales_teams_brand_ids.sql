-- 0043: Phòng gắn DANH SÁCH thương hiệu cụ thể (thay cho brand_id đơn / NULL "tất cả").
-- Lý do: "brand_id NULL = tất cả hãng" là sai — nếu showroom bật thêm hãng mới sau này,
-- lead hãng mới sẽ tự chảy vào phòng ngoài ý muốn. Nay phòng gắn tập hãng CỐ ĐỊNH
-- (vd Phạm Văn Đồng: 3 phòng = {KIA, Mazda}); thêm hãng mới phải chọn tay.
--   brand_ids = [] : phòng chưa gắn hãng nào → KHÔNG nhận lead (phải cấu hình).
--   brand_ids = [KIA]        : phòng chỉ nhận KIA (tương thích phòng khoá-hãng cũ).
--   brand_ids = [KIA, Mazda] : phòng nhận cả hai.
-- Cột brand_id cũ giữ lại (không dùng cho định tuyến nữa) để không phá dữ liệu cũ.
-- Idempotent.

SET search_path TO crm_thacoauto, public;

ALTER TABLE crm_thacoauto.sales_teams
  ADD COLUMN IF NOT EXISTS brand_ids uuid[] NOT NULL DEFAULT '{}';

-- Backfill 1: phòng khoá 1 hãng (brand_id set) → brand_ids = [brand_id]
UPDATE crm_thacoauto.sales_teams
  SET brand_ids = ARRAY[brand_id]
  WHERE brand_id IS NOT NULL AND cardinality(brand_ids) = 0;

-- Backfill 2: phòng đa hãng cũ (brand_id NULL) → tất cả hãng showroom đang kinh doanh
UPDATE crm_thacoauto.sales_teams t
  SET brand_ids = sub.arr
  FROM (
    SELECT sb.showroom_id, array_agg(sb.brand_id) AS arr
    FROM crm_thacoauto.showroom_brands sb GROUP BY sb.showroom_id
  ) sub
  WHERE t.showroom_id = sub.showroom_id
    AND t.brand_id IS NULL
    AND cardinality(t.brand_ids) = 0;

NOTIFY pgrst, 'reload schema';
