-- 0022: Hệ thống lại vai trò — đa phạm vi brand/showroom, bỏ tp_showroom, thêm digital_mkt
-- - Bảng phụ user_brands / user_showrooms: 1 user phụ trách NHIỀU thương hiệu / showroom
-- - Helper get_my_brand_ids() / get_my_showroom_ids() trả tập uuid
-- - CHECK role: bỏ tp_showroom, thêm digital_mkt
-- - RLS leads: brand/showroom dùng IN(helper); thêm digital_mkt vào nhánh công ty
-- - Backfill bảng phụ từ cột đơn brand_id / showroom_id hiện có
-- Idempotent.

SET search_path TO crm_thacoauto, public;

-- 1) Bảng phụ đa phạm vi
CREATE TABLE IF NOT EXISTS crm_thacoauto.user_brands (
  user_id  uuid NOT NULL REFERENCES crm_thacoauto.users(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES crm_thacoauto.brands(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, brand_id)
);
CREATE TABLE IF NOT EXISTS crm_thacoauto.user_showrooms (
  user_id     uuid NOT NULL REFERENCES crm_thacoauto.users(id) ON DELETE CASCADE,
  showroom_id uuid NOT NULL REFERENCES crm_thacoauto.showrooms(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, showroom_id)
);

-- 2) GRANTs (Gotcha #5). RLS OFF cố ý: chỉ admin ghi qua service_role; quyền đọc gác bằng helper SECURITY DEFINER.
GRANT USAGE ON SCHEMA crm_thacoauto TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.user_brands    TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.user_showrooms TO anon, authenticated, service_role;

-- 3) Chuyển user tp_showroom (nếu còn) sang gd_showroom TRƯỚC khi siết CHECK
UPDATE crm_thacoauto.users SET role = 'gd_showroom' WHERE role = 'tp_showroom';

-- 4) CHECK role: bỏ tp_showroom, thêm digital_mkt
ALTER TABLE crm_thacoauto.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE crm_thacoauto.users ADD CONSTRAINT users_role_check CHECK (role IN (
  'platform_owner',
  'admin','gd_cty','mkt_cty','digital_mkt',
  'gd_brand','mkt_brand','tp_brand',
  'gd_showroom','mkt_showroom',
  'tp_phong','tvbh'
));

-- 5) Backfill bảng phụ từ cột đơn hiện có
INSERT INTO crm_thacoauto.user_brands (user_id, brand_id)
SELECT id, brand_id FROM crm_thacoauto.users
WHERE role IN ('gd_brand','tp_brand','mkt_brand') AND brand_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO crm_thacoauto.user_showrooms (user_id, showroom_id)
SELECT id, showroom_id FROM crm_thacoauto.users
WHERE role IN ('gd_showroom','mkt_showroom') AND showroom_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 6) Helper trả tập uuid (SECURITY DEFINER — bỏ qua RLS, chỉ đọc của chính mình)
CREATE OR REPLACE FUNCTION crm_thacoauto.get_my_brand_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'crm_thacoauto','public','auth','pg_catalog'
AS $$ SELECT brand_id FROM crm_thacoauto.user_brands WHERE user_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION crm_thacoauto.get_my_showroom_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'crm_thacoauto','public','auth','pg_catalog'
AS $$ SELECT showroom_id FROM crm_thacoauto.user_showrooms WHERE user_id = auth.uid() $$;

-- 7) RLS leads: brand/showroom dùng IN(helper); thêm digital_mkt vào nhánh công ty
DROP POLICY IF EXISTS leads_select ON crm_thacoauto.leads;
CREATE POLICY leads_select ON crm_thacoauto.leads FOR SELECT USING (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty','mkt_cty','digital_mkt')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','mkt_brand','tp_brand')
    AND brand_id IN (SELECT crm_thacoauto.get_my_brand_ids())
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','mkt_showroom')
    AND showroom_id IN (SELECT crm_thacoauto.get_my_showroom_ids())
  OR crm_thacoauto.get_my_role() = 'tp_phong'
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
);

DROP POLICY IF EXISTS leads_update ON crm_thacoauto.leads;
CREATE POLICY leads_update ON crm_thacoauto.leads FOR UPDATE USING (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','tp_brand')
    AND brand_id IN (SELECT crm_thacoauto.get_my_brand_ids())
  OR crm_thacoauto.get_my_role() = 'gd_showroom'
    AND showroom_id IN (SELECT crm_thacoauto.get_my_showroom_ids())
  OR crm_thacoauto.get_my_role() = 'tp_phong'
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
) WITH CHECK (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','tp_brand')
    AND brand_id IN (SELECT crm_thacoauto.get_my_brand_ids())
  OR crm_thacoauto.get_my_role() = 'gd_showroom'
    AND showroom_id IN (SELECT crm_thacoauto.get_my_showroom_ids())
  OR crm_thacoauto.get_my_role() = 'tp_phong'
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
);

DROP POLICY IF EXISTS leads_insert ON crm_thacoauto.leads;
CREATE POLICY leads_insert ON crm_thacoauto.leads FOR INSERT WITH CHECK (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','tp_brand')
    AND brand_id IN (SELECT crm_thacoauto.get_my_brand_ids())
  OR crm_thacoauto.get_my_role() = 'gd_showroom'
    AND showroom_id IN (SELECT crm_thacoauto.get_my_showroom_ids())
  OR crm_thacoauto.get_my_role() = 'tp_phong'
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
);
