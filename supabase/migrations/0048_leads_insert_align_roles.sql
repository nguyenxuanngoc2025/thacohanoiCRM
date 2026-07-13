-- 0048: ĐỒNG BỘ leads_insert với leads_select/leads_update.
-- Bug: app (CAN_CREATE_LEAD) cho các vai trò marketing + TVBH thêm lead thủ công,
-- nhưng RLS INSERT (0033) chỉ phủ admin/gd_cty/gd_brand/tp_brand/gd_showroom/tp_phong
-- → mkt_cty/digital_mkt/mkt_brand/mkt_showroom/tvbh bị "new row violates row-level
-- security policy for table leads" khi bấm Tạo lead. SELECT/UPDATE (0033) đã phủ đủ.
-- Sửa: tái tạo leads_insert theo ĐÚNG khung điều kiện của leads_update WITH CHECK
-- (giữ nguyên khoá công ty cho nhánh thương hiệu — chống rò chéo tenant như 0033).
SET search_path TO crm_thacoauto, public;

DROP POLICY IF EXISTS leads_insert ON crm_thacoauto.leads;
CREATE POLICY leads_insert ON crm_thacoauto.leads FOR INSERT WITH CHECK (
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

NOTIFY pgrst, 'reload schema';
