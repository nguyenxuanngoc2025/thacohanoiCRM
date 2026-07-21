-- 0056: Thêm vai trò MỚI 'tn' (Trưởng nhóm bán hàng).
-- TN giống Trưởng phòng (tp_phong): phạm vi PHÒNG, phân giao được — NHƯNG cũng BÁN
-- (được nhận lead & nằm trong danh sách chia tự động, mirror TVBH). Xử lý app đã thêm.
-- Ở RLS: TN dùng ĐÚNG nhánh phạm vi phòng như tp_phong (sales_team_id = phòng mình).
-- Việc "nhận lead để bán" nằm ở tầng app (auto-distribute + dropdown Giao cho), KHÔNG cần
-- nhánh RLS riêng như tvbh (assigned_to=uid) vì TN đã thấy TRỌN lead phòng qua nhánh phòng.
SET search_path TO crm_thacoauto, public;

-- 1) Nới CHECK constraint role để chấp nhận 'tn'
ALTER TABLE crm_thacoauto.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE crm_thacoauto.users ADD CONSTRAINT users_role_check CHECK (role IN (
  'platform_owner',
  'admin','gd_cty','mkt_cty','digital_mkt',
  'gd_brand','mkt_brand','tp_brand',
  'gd_showroom','mkt_showroom',
  'tp_phong','tn','tvbh'
));

-- 2) Tái tạo 3 policy leads (theo bản mới nhất: select/update=0033, insert=0048)
--    thêm nhánh phòng cho 'tn' NGAY SAU nhánh 'tp_phong' (cùng điều kiện).

DROP POLICY IF EXISTS leads_select ON crm_thacoauto.leads;
CREATE POLICY leads_select ON crm_thacoauto.leads FOR SELECT USING (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty','mkt_cty','digital_mkt')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','mkt_brand','tp_brand')
    AND brand_id IN (SELECT crm_thacoauto.get_my_brand_ids())
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','mkt_showroom')
    AND showroom_id IN (SELECT crm_thacoauto.get_my_showroom_ids())
  OR crm_thacoauto.get_my_role() IN ('tp_phong','tn')
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
);

DROP POLICY IF EXISTS leads_update ON crm_thacoauto.leads;
CREATE POLICY leads_update ON crm_thacoauto.leads FOR UPDATE USING (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty','mkt_cty','digital_mkt')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','tp_brand','mkt_brand')
    AND brand_id IN (SELECT crm_thacoauto.get_my_brand_ids())
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','mkt_showroom')
    AND showroom_id IN (SELECT crm_thacoauto.get_my_showroom_ids())
  OR crm_thacoauto.get_my_role() IN ('tp_phong','tn')
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
) WITH CHECK (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty','mkt_cty','digital_mkt')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','tp_brand','mkt_brand')
    AND brand_id IN (SELECT crm_thacoauto.get_my_brand_ids())
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','mkt_showroom')
    AND showroom_id IN (SELECT crm_thacoauto.get_my_showroom_ids())
  OR crm_thacoauto.get_my_role() IN ('tp_phong','tn')
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
);

DROP POLICY IF EXISTS leads_insert ON crm_thacoauto.leads;
CREATE POLICY leads_insert ON crm_thacoauto.leads FOR INSERT WITH CHECK (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty','mkt_cty','digital_mkt')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','tp_brand','mkt_brand')
    AND brand_id IN (SELECT crm_thacoauto.get_my_brand_ids())
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','mkt_showroom')
    AND showroom_id IN (SELECT crm_thacoauto.get_my_showroom_ids())
  OR crm_thacoauto.get_my_role() IN ('tp_phong','tn')
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
);

NOTIFY pgrst, 'reload schema';
