-- 0010_import_tai_bus_models.sql
-- Import dòng xe của thương hiệu "Tải Bus" từ dự án budget (mkt_budget.master_models, brand TẢI BUS).
-- Bỏ 2 dòng aggregate ("Σ Nhóm Tải", "Σ Nhóm Bus") vì là bucket tổng hợp của budget, không phải dòng xe thật.
-- Idempotent.

SET search_path TO crm_thacoauto, public;

INSERT INTO crm_thacoauto.models (brand_id, name, sort_order, is_active)
SELECT b.id, m.name, m.sort_order, true
FROM crm_thacoauto.brands b
JOIN (VALUES
  ('Tải Van', 1),
  ('Tải nhẹ máy xăng', 2),
  ('Tải nhẹ máy dầu', 3),
  ('Tải trung - Ben trung', 4),
  ('Đầu kéo - Tải nặng - Ben nặng', 5),
  ('Bus', 6),
  ('Mini Bus', 7)
) AS m(name, sort_order) ON true
WHERE b.slug = 'tai-bus'
  AND NOT EXISTS (
    SELECT 1 FROM crm_thacoauto.models x WHERE x.brand_id = b.id AND x.name = m.name
  );
