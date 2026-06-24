-- 0009_showroom_brands.sql
-- Showroom là ĐỊA ĐIỂM bán NHIỀU thương hiệu → bảng junction showroom_brands (thay cho cột brand_id đơn lẻ).
-- Seed quan hệ từ dữ liệu dự án budget (mkt_budget.showrooms.brands), chỉ lấy subset KIA/Mazda/Tải Bus đang có trong CRM.
-- Idempotent.

SET search_path TO crm_thacoauto, public;

-- 1) Bảng junction
CREATE TABLE IF NOT EXISTS crm_thacoauto.showroom_brands (
  showroom_id uuid NOT NULL REFERENCES crm_thacoauto.showrooms(id) ON DELETE CASCADE,
  brand_id    uuid NOT NULL REFERENCES crm_thacoauto.brands(id)    ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (showroom_id, brand_id)
);

-- 2) GRANTs (Gotcha #5: schema mới/bảng mới cần cấp quyền role, RLS vẫn gác từng dòng)
GRANT USAGE ON SCHEMA crm_thacoauto TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.showroom_brands TO anon, authenticated, service_role;
-- RLS OFF cố ý: master catalog (đồng nhất brands/showrooms) — chỉ admin ghi qua service_role.

-- 3) Seed quan hệ showroom ↔ thương hiệu (map theo mã showroom + slug thương hiệu)
INSERT INTO crm_thacoauto.showroom_brands (showroom_id, brand_id)
SELECT s.id, b.id
FROM crm_thacoauto.showrooms s
JOIN (VALUES
  ('CM','kia'), ('CM','mazda'), ('CM','tai-bus'),
  ('DAITU','tai-bus'),
  ('DT','kia'), ('DT','mazda'),
  ('GP','kia'), ('GP','mazda'), ('GP','tai-bus'),
  ('HN','kia'), ('HN','mazda'), ('HN','tai-bus'),
  ('NB','tai-bus'),
  ('PVD','kia'), ('PVD','mazda'),
  ('TKC','kia'), ('TKC','mazda')
) AS m(code, slug) ON m.code = s.code
JOIN crm_thacoauto.brands b ON b.slug = m.slug
ON CONFLICT (showroom_id, brand_id) DO NOTHING;
