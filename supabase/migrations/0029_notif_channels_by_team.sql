-- 0029: Kênh thông báo theo Phòng bán hàng (sales_team) + Nhóm BLĐ
-- Schema crm_thacoauto. Áp qua skill supabase-self-hosted-ops (docker exec psql).
--
-- Mô hình cũ gắn kênh theo showroom (scope='showroom') → đổ cả showroom (mọi brand)
-- về 1 group = quá loãng. Mô hình mới: mỗi phòng bán hàng = 1 group (scope='sales'),
-- nhóm BLĐ theo showroom hoặc toàn công ty (scope='management').

-- 1) Xoá 3 kênh cũ scope='showroom' + notifications phụ thuộc (chúng route cả showroom).
DELETE FROM crm_thacoauto.notifications
  WHERE channel_id IN (
    SELECT id FROM crm_thacoauto.notification_channels WHERE scope = 'showroom'
  );
DELETE FROM crm_thacoauto.notification_channels WHERE scope = 'showroom';

-- 2) Thêm cột sales_team_id (mỗi kênh sales gắn 1 phòng).
ALTER TABLE crm_thacoauto.notification_channels
  ADD COLUMN IF NOT EXISTS sales_team_id uuid
    REFERENCES crm_thacoauto.sales_teams(id) ON DELETE CASCADE;

-- 3) Đổi CHECK scope: ('showroom','management') -> ('sales','management').
--    Drop động theo tên ràng buộc thực tế (tránh phụ thuộc tên cố định).
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'crm_thacoauto'
      AND rel.relname = 'notification_channels'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%scope%'
  LOOP
    EXECUTE format('ALTER TABLE crm_thacoauto.notification_channels DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE crm_thacoauto.notification_channels
  ALTER COLUMN scope SET DEFAULT 'sales';

ALTER TABLE crm_thacoauto.notification_channels
  ADD CONSTRAINT notification_channels_scope_check
    CHECK (scope IN ('sales','management'));

-- 4) Grants (Gotcha #5).
GRANT ALL ON crm_thacoauto.notification_channels TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.notifications          TO anon, authenticated, service_role;
