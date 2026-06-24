-- 0007_showroom_location_only.sql
-- Showroom là ĐỊA ĐIỂM (Giải Phóng, Chương Mỹ...), không gắn cứng 1 brand:
-- mỗi địa điểm bán cả KIA lẫn Mazda; brand đã track riêng ở từng lead.
-- => brand_id nullable; thay 12 dòng brand-specific (KIA Giải Phóng/Mazda Giải Phóng)
--    bằng 6 dòng địa điểm; repoint lead/user/channel rồi xoá 12 dòng cũ.

SET search_path TO crm_thacoauto, public;

ALTER TABLE crm_thacoauto.showrooms ALTER COLUMN brand_id DROP NOT NULL;

-- 1) Tạo 6 showroom địa điểm (brand_id NULL = đa thương hiệu), idempotent theo code
WITH co AS (SELECT id FROM crm_thacoauto.companies WHERE slug = 'thaco-auto-hanoi'),
     locs(name, code) AS (
       VALUES
         ('Giải Phóng',     'GP'),
         ('Chương Mỹ',      'CM'),
         ('Hà Nam',         'HN'),
         ('Trần Khát Chân', 'TKC'),
         ('Đông Trù',       'DT'),
         ('Phạm Văn Đồng',  'PVD')
     )
INSERT INTO crm_thacoauto.showrooms (company_id, brand_id, name, code)
SELECT co.id, NULL, locs.name, locs.code
FROM co, locs
WHERE NOT EXISTS (SELECT 1 FROM crm_thacoauto.showrooms s WHERE s.code = locs.code);

-- 2) Repoint mọi tham chiếu từ dòng brand-specific (KIA-xx / MAZDA-xx) sang dòng địa điểm,
--    rồi xoá dòng cũ
DO $$
DECLARE
  r     RECORD;
  newid uuid;
BEGIN
  FOR r IN
    SELECT id, code FROM crm_thacoauto.showrooms
    WHERE code LIKE 'KIA-%' OR code LIKE 'MAZDA-%'
  LOOP
    newid := (SELECT id FROM crm_thacoauto.showrooms
              WHERE code = regexp_replace(r.code, '^(KIA|MAZDA)-', ''));
    IF newid IS NOT NULL THEN
      UPDATE crm_thacoauto.leads            SET showroom_id = newid WHERE showroom_id = r.id;
      UPDATE crm_thacoauto.users            SET showroom_id = newid WHERE showroom_id = r.id;
      UPDATE crm_thacoauto.channel_accounts SET showroom_id = newid WHERE showroom_id = r.id;
      DELETE FROM crm_thacoauto.showrooms WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
