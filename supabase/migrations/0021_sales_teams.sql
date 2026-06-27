-- 0021: Phòng bán hàng (lớp giữa Showroom ↔ TVBH) + phân bổ lead 3 cấp
-- - sales_teams: mỗi phòng 1 thương hiệu, 1 trưởng phòng (head_user_id), thuộc 1 showroom
-- - team_allocation: trọng số phân bổ theo (phòng, kênh) — tỷ lệ áp RIÊNG từng kênh
-- - users.sales_team_id / leads.sales_team_id
-- - vai trò tp_phong + RLS theo phòng
-- - backfill: mỗi (showroom, brand) 1 phòng mặc định; gán TVBH + lead hiện có vào phòng
-- Idempotent.

SET search_path TO crm_thacoauto, public;

-- 1) Bảng phòng bán hàng
CREATE TABLE IF NOT EXISTS crm_thacoauto.sales_teams (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES crm_thacoauto.companies(id),
  showroom_id  uuid NOT NULL REFERENCES crm_thacoauto.showrooms(id) ON DELETE CASCADE,
  brand_id     uuid NOT NULL REFERENCES crm_thacoauto.brands(id),
  name         text NOT NULL,
  head_user_id uuid REFERENCES crm_thacoauto.users(id),
  is_default   boolean NOT NULL DEFAULT false,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_teams_showroom_brand_idx
  ON crm_thacoauto.sales_teams(showroom_id, brand_id);

-- 2) Trọng số phân bổ theo (phòng, kênh). channel='*' = mặc định mọi kênh.
CREATE TABLE IF NOT EXISTS crm_thacoauto.team_allocation (
  sales_team_id uuid NOT NULL REFERENCES crm_thacoauto.sales_teams(id) ON DELETE CASCADE,
  channel       text NOT NULL,
  weight        numeric NOT NULL DEFAULT 1 CHECK (weight >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sales_team_id, channel)
);

-- 3) Cột liên kết phòng
ALTER TABLE crm_thacoauto.users
  ADD COLUMN IF NOT EXISTS sales_team_id uuid REFERENCES crm_thacoauto.sales_teams(id);
ALTER TABLE crm_thacoauto.leads
  ADD COLUMN IF NOT EXISTS sales_team_id uuid REFERENCES crm_thacoauto.sales_teams(id);
CREATE INDEX IF NOT EXISTS leads_sales_team_idx ON crm_thacoauto.leads(sales_team_id);

-- 4) Vai trò tp_phong (TP bán hàng cấp phòng)
ALTER TABLE crm_thacoauto.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE crm_thacoauto.users ADD CONSTRAINT users_role_check CHECK (role IN (
  'platform_owner',
  'admin','gd_cty','mkt_cty',
  'gd_brand','mkt_brand','tp_brand',
  'gd_showroom','mkt_showroom','tp_showroom',
  'tp_phong',   -- TP Bán hàng (phòng): chỉ phòng mình
  'tvbh'
));

-- 5) Helper: phòng của tôi
CREATE OR REPLACE FUNCTION crm_thacoauto.get_my_sales_team_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'crm_thacoauto','public','auth','pg_catalog'
AS $$ SELECT sales_team_id FROM crm_thacoauto.users WHERE id = auth.uid() $$;

-- 6) RLS leads: thêm nhánh tp_phong (xem/ghi theo phòng)
DROP POLICY IF EXISTS leads_select ON crm_thacoauto.leads;
CREATE POLICY leads_select ON crm_thacoauto.leads FOR SELECT
USING (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty','mkt_cty')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','mkt_brand','tp_brand')
    AND brand_id = crm_thacoauto.get_my_brand_id()
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','mkt_showroom','tp_showroom')
    AND showroom_id = crm_thacoauto.get_my_showroom_id()
  OR crm_thacoauto.get_my_role() = 'tp_phong'
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
);

DROP POLICY IF EXISTS leads_update ON crm_thacoauto.leads;
CREATE POLICY leads_update ON crm_thacoauto.leads FOR UPDATE
USING (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','tp_brand')
    AND brand_id = crm_thacoauto.get_my_brand_id()
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','tp_showroom')
    AND showroom_id = crm_thacoauto.get_my_showroom_id()
  OR crm_thacoauto.get_my_role() = 'tp_phong'
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
)
WITH CHECK (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','tp_brand')
    AND brand_id = crm_thacoauto.get_my_brand_id()
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','tp_showroom')
    AND showroom_id = crm_thacoauto.get_my_showroom_id()
  OR crm_thacoauto.get_my_role() = 'tp_phong'
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
);

DROP POLICY IF EXISTS leads_insert ON crm_thacoauto.leads;
CREATE POLICY leads_insert ON crm_thacoauto.leads FOR INSERT
WITH CHECK (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','tp_brand')
    AND brand_id = crm_thacoauto.get_my_brand_id()
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','tp_showroom')
    AND showroom_id = crm_thacoauto.get_my_showroom_id()
  OR crm_thacoauto.get_my_role() = 'tp_phong'
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
);

-- 7) GRANTs (Gotcha #5). RLS OFF cố ý: master config, chỉ admin ghi qua service_role.
GRANT USAGE ON SCHEMA crm_thacoauto TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.sales_teams    TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.team_allocation TO anon, authenticated, service_role;

-- 8) Backfill: mỗi (showroom, brand) 1 phòng mặc định
INSERT INTO crm_thacoauto.sales_teams (company_id, showroom_id, brand_id, name, is_default)
SELECT s.company_id, sb.showroom_id, sb.brand_id,
       'Phòng ' || b.name AS name, true
FROM crm_thacoauto.showroom_brands sb
JOIN crm_thacoauto.showrooms s ON s.id = sb.showroom_id
JOIN crm_thacoauto.brands b ON b.id = sb.brand_id
WHERE NOT EXISTS (
  SELECT 1 FROM crm_thacoauto.sales_teams t
  WHERE t.showroom_id = sb.showroom_id AND t.brand_id = sb.brand_id
);

-- 8b) TVBH hiện có → phòng mặc định theo (showroom_id, brand_id)
UPDATE crm_thacoauto.users u
SET sales_team_id = t.id
FROM crm_thacoauto.sales_teams t
WHERE u.role = 'tvbh'
  AND u.sales_team_id IS NULL
  AND u.showroom_id = t.showroom_id
  AND u.brand_id = t.brand_id
  AND t.is_default = true;

-- 8c) Lead hiện có → phòng mặc định theo (showroom_id, brand_id)
UPDATE crm_thacoauto.leads l
SET sales_team_id = t.id
FROM crm_thacoauto.sales_teams t
WHERE l.sales_team_id IS NULL
  AND l.showroom_id = t.showroom_id
  AND l.brand_id = t.brand_id
  AND t.is_default = true;
