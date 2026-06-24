-- 0011: Mở rộng vai trò theo sơ đồ tổ chức công ty (9 chức danh + admin hệ thống)
-- - Thêm brand_id cho user (vai trò cấp thương hiệu)
-- - Mở rộng CHECK role
-- - get_my_brand_id() + RLS leads_select theo phạm vi company / brand / showroom / assigned

ALTER TABLE crm_thacoauto.users
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES crm_thacoauto.brands(id);

ALTER TABLE crm_thacoauto.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE crm_thacoauto.users ADD CONSTRAINT users_role_check CHECK (role IN (
  'admin',         -- Quản trị hệ thống (chủ nền tảng): quản lý tài khoản, kênh, cấu hình
  'gd_cty',        -- Tổng Giám đốc Công ty: xem toàn công ty
  'mkt_cty',       -- Marketing Công ty: xem toàn công ty (không phân giao)
  'gd_brand',      -- Giám đốc Thương hiệu: theo thương hiệu
  'mkt_brand',     -- Marketing Thương hiệu: theo thương hiệu (không phân giao)
  'tp_brand',      -- TP Kinh doanh Thương hiệu: theo thương hiệu
  'gd_showroom',   -- Giám đốc Showroom: theo showroom
  'mkt_showroom',  -- Marketing Showroom: theo showroom (không phân giao)
  'tp_showroom',   -- TP Bán hàng (showroom): theo showroom
  'tvbh'           -- Tư vấn bán hàng: chỉ lead được giao
));

CREATE OR REPLACE FUNCTION crm_thacoauto.get_my_brand_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'crm_thacoauto','public','auth','pg_catalog'
AS $$ SELECT brand_id FROM crm_thacoauto.users WHERE id = auth.uid() $$;

-- RLS leads: phạm vi xem theo vai trò
DROP POLICY IF EXISTS leads_select ON crm_thacoauto.leads;
CREATE POLICY leads_select ON crm_thacoauto.leads FOR SELECT
USING (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty','mkt_cty')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','mkt_brand','tp_brand')
    AND brand_id = crm_thacoauto.get_my_brand_id()
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','mkt_showroom','tp_showroom')
    AND showroom_id = crm_thacoauto.get_my_showroom_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
);

-- RLS users: tự xem hồ sơ mình; mọi vai trò ngoài tvbh xem được đồng nghiệp cùng công ty
DROP POLICY IF EXISTS users_select_self ON crm_thacoauto.users;
CREATE POLICY users_select_self ON crm_thacoauto.users FOR SELECT
USING (
  id = auth.uid()
  OR crm_thacoauto.get_my_role() <> 'tvbh' AND company_id = crm_thacoauto.get_my_company_id()
);
