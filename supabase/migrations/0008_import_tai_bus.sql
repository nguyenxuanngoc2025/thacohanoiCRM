-- 0008_import_tai_bus.sql
-- Import thương hiệu "Tải Bus" + các showroom (địa điểm) bán Tải Bus, lấy từ dự án budget (mkt_budget).
-- Showroom có brand TẢI BUS trong budget: Chương Mỹ, Đài Tư, Giải Phóng, Hà Nam, Ninh Bình.
-- CRM đã có Chương Mỹ/Giải Phóng/Hà Nam → chỉ thêm Đài Tư + Ninh Bình (địa điểm đa thương hiệu, brand_id NULL).
-- Idempotent: chỉ insert khi chưa tồn tại.

SET search_path TO crm_thacoauto, public;

-- 1) Thương hiệu Tải Bus
INSERT INTO crm_thacoauto.brands (name, slug)
SELECT 'Tải Bus', 'tai-bus'
WHERE NOT EXISTS (SELECT 1 FROM crm_thacoauto.brands WHERE slug = 'tai-bus');

-- 2) 2 showroom địa điểm còn thiếu (brand_id NULL = đa thương hiệu, đồng nhất với 6 địa điểm KIA/Mazda)
WITH co AS (SELECT id FROM crm_thacoauto.companies WHERE slug = 'thaco-auto-hanoi'),
     locs(name, code) AS (
       VALUES
         ('Đài Tư',    'DAITU'),
         ('Ninh Bình', 'NB')
     )
INSERT INTO crm_thacoauto.showrooms (company_id, brand_id, name, code)
SELECT co.id, NULL, locs.name, locs.code
FROM co, locs
WHERE NOT EXISTS (SELECT 1 FROM crm_thacoauto.showrooms s WHERE s.code = locs.code);
