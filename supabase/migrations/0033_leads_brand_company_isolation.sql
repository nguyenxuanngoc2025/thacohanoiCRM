-- 0033: VÁ RÒ CHÉO TENANT — nhánh "thương hiệu" trong RLS leads thiếu khoá công ty.
-- brands là master TOÀN CỤC (KIA/Mazda dùng chung mọi công ty) → vai trò cấp thương hiệu
-- (gd_brand/tp_brand/mkt_brand) chỉ khớp brand_id IN (get_my_brand_ids()) sẽ XEM/SỬA/TẠO
-- được lead của CÔNG TY KHÁC cùng thương hiệu. Khi onboard nhiều đại lý KIA/Mazda → lộ data.
-- Sửa: mọi nhánh brand thêm AND company_id = get_my_company_id() (vẫn nằm trong AND-group
-- của nhánh đó vì AND ưu tiên hơn OR). An toàn: lead của user brand vốn luôn trong công ty họ.
-- Tái tạo trọn 3 policy theo bản mới nhất (select=0022, insert=0022, update=0032).
SET search_path TO crm_thacoauto, public;

DROP POLICY IF EXISTS leads_select ON crm_thacoauto.leads;
CREATE POLICY leads_select ON crm_thacoauto.leads FOR SELECT USING (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty','mkt_cty','digital_mkt')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','mkt_brand','tp_brand')
    AND brand_id IN (SELECT crm_thacoauto.get_my_brand_ids())
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','mkt_showroom')
    AND showroom_id IN (SELECT crm_thacoauto.get_my_showroom_ids())
  OR crm_thacoauto.get_my_role() = 'tp_phong'
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
  OR crm_thacoauto.get_my_role() = 'tp_phong'
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
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() = 'gd_showroom'
    AND showroom_id IN (SELECT crm_thacoauto.get_my_showroom_ids())
  OR crm_thacoauto.get_my_role() = 'tp_phong'
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
);

NOTIFY pgrst, 'reload schema';
