-- 0055: thêm loại nhóm thông báo scope='brand' (ban lãnh đạo phụ trách thương hiệu).
-- Kênh brand: scope='brand', brand_ids = các hãng phụ trách, company_id sẵn có (bắt buộc),
-- sales_team_ids = '{}', showroom_id = null. Cô lập tenant ở khâu định tuyến (lọc kèm company_id).

ALTER TABLE crm_thacoauto.notification_channels
  ADD COLUMN IF NOT EXISTS brand_ids uuid[] NOT NULL DEFAULT '{}';

-- Nới CHECK scope: ('sales','management') -> ('sales','management','brand').
-- Drop ĐỘNG theo tên ràng buộc thực tế (tránh phụ thuộc tên cứng) như migration 0029.
DO $$
DECLARE cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'crm_thacoauto'
    AND rel.relname = 'notification_channels'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%scope%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE crm_thacoauto.notification_channels DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE crm_thacoauto.notification_channels
  ADD CONSTRAINT notification_channels_scope_check
  CHECK (scope IN ('sales','management','brand'));

-- Grants (Gotcha #5) + reload schema PostgREST.
GRANT ALL ON crm_thacoauto.notification_channels TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
