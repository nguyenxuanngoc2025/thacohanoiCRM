-- 0005_import_showrooms.sql
-- Import danh sách showroom KIA/Mazda thật của Thaco Auto Hà Nội (lấy từ dự án budget mkt_budget).
-- 6 địa điểm vật lý bán cả KIA và Mazda. Vì model showroom hiện 1-showroom-1-brand
-- (gắn channel/FB page + phân giao theo brand), mỗi địa điểm tách thành 2 dòng (KIA + Mazda) = 12 dòng.
-- Sau đó repoint dữ liệu demo (lead/user/channel) sang showroom thật rồi xoá 2 showroom demo.

SET search_path TO crm_thacoauto, public;

-- 1) Insert 12 showroom thật (idempotent theo name)
WITH co AS (SELECT id FROM crm_thacoauto.companies WHERE slug = 'thaco-auto-hanoi'),
     src(brand_slug, name, code) AS (
       VALUES
         ('kia',   'KIA Giải Phóng',       'KIA-GP'),
         ('kia',   'KIA Chương Mỹ',        'KIA-CM'),
         ('kia',   'KIA Hà Nam',           'KIA-HN'),
         ('kia',   'KIA Trần Khát Chân',   'KIA-TKC'),
         ('kia',   'KIA Đông Trù',         'KIA-DT'),
         ('kia',   'KIA Phạm Văn Đồng',    'KIA-PVD'),
         ('mazda', 'Mazda Giải Phóng',     'MAZDA-GP'),
         ('mazda', 'Mazda Chương Mỹ',      'MAZDA-CM'),
         ('mazda', 'Mazda Hà Nam',         'MAZDA-HN'),
         ('mazda', 'Mazda Trần Khát Chân', 'MAZDA-TKC'),
         ('mazda', 'Mazda Đông Trù',       'MAZDA-DT'),
         ('mazda', 'Mazda Phạm Văn Đồng',  'MAZDA-PVD')
     )
INSERT INTO crm_thacoauto.showrooms (company_id, brand_id, name, code)
SELECT co.id, b.id, src.name, src.code
FROM src
JOIN crm_thacoauto.brands b ON b.slug = src.brand_slug
CROSS JOIN co
WHERE NOT EXISTS (
  SELECT 1 FROM crm_thacoauto.showrooms s WHERE s.name = src.name
);

-- 2) Repoint dữ liệu demo sang showroom thật (KIA -> KIA Giải Phóng, Mazda -> Mazda Giải Phóng)
DO $$
DECLARE
  demo_kia   uuid := 'fbf3a501-6b02-4962-8786-66f53910ba56'; -- KIA Hà Nội (test)
  demo_mazda uuid := '36203866-f209-420e-a738-fb7b8ffc0c1e'; -- Mazda Hà Nội (demo)
  real_kia   uuid := (SELECT id FROM crm_thacoauto.showrooms WHERE name = 'KIA Giải Phóng');
  real_mazda uuid := (SELECT id FROM crm_thacoauto.showrooms WHERE name = 'Mazda Giải Phóng');
BEGIN
  UPDATE crm_thacoauto.leads            SET showroom_id = real_kia   WHERE showroom_id = demo_kia;
  UPDATE crm_thacoauto.users            SET showroom_id = real_kia   WHERE showroom_id = demo_kia;
  UPDATE crm_thacoauto.channel_accounts SET showroom_id = real_kia   WHERE showroom_id = demo_kia;

  UPDATE crm_thacoauto.leads            SET showroom_id = real_mazda WHERE showroom_id = demo_mazda;
  UPDATE crm_thacoauto.users            SET showroom_id = real_mazda WHERE showroom_id = demo_mazda;
  UPDATE crm_thacoauto.channel_accounts SET showroom_id = real_mazda WHERE showroom_id = demo_mazda;

  -- 3) Xoá 2 showroom demo sau khi đã hết tham chiếu
  DELETE FROM crm_thacoauto.showrooms WHERE id IN (demo_kia, demo_mazda);
END $$;
