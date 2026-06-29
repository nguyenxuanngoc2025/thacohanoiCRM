-- 0032: Cho phép vai trò Marketing SỬA lead trong phạm vi XEM của họ.
-- Trước: leads_update (0022) bỏ sót nhóm marketing (mkt_cty, digital_mkt, mkt_brand, mkt_showroom)
-- → họ XEM được nhưng UPDATE bị RLS chặn ÂM THẦM (0 dòng, không lỗi) → app báo "đã lưu" giả.
-- Nay phạm vi UPDATE = phạm vi SELECT (xem được thì sửa được). KHÔNG đụng phân giao:
-- đổi assigned_to vẫn gác ở tầng app (CAN_ASSIGN) nên marketing không thấy nút phân giao.
SET search_path TO crm_thacoauto, public;

DROP POLICY IF EXISTS leads_update ON crm_thacoauto.leads;
CREATE POLICY leads_update ON crm_thacoauto.leads FOR UPDATE USING (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty','mkt_cty','digital_mkt')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','tp_brand','mkt_brand')
    AND brand_id IN (SELECT crm_thacoauto.get_my_brand_ids())
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
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','mkt_showroom')
    AND showroom_id IN (SELECT crm_thacoauto.get_my_showroom_ids())
  OR crm_thacoauto.get_my_role() = 'tp_phong'
    AND sales_team_id = crm_thacoauto.get_my_sales_team_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
);

NOTIFY pgrst, 'reload schema';
