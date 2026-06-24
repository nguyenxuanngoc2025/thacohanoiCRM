-- 0013: Policy GHI cho leads + lead_logs (trước đây chỉ có SELECT → mọi thao tác
-- sửa qua tài khoản đăng nhập bị RLS chặn âm thầm: markContacted, đổi phân loại,
-- cập nhật liên hệ, đổi phụ trách, tạo lead thủ công). Service_role (webhook/backfill)
-- không ảnh hưởng vì bỏ qua RLS.
--
-- Phạm vi ghi bám theo mô hình 10 vai trò (0011), loại trừ vai trò chỉ-xem (mkt_*):
--   company  : admin, gd_cty
--   brand    : gd_brand, tp_brand
--   showroom : gd_showroom, tp_showroom
--   assigned : tvbh (chỉ lead được giao)

-- UPDATE: sửa lead trong phạm vi (mark contacted, status, note, reassign…)
DROP POLICY IF EXISTS leads_update ON crm_thacoauto.leads;
CREATE POLICY leads_update ON crm_thacoauto.leads FOR UPDATE
USING (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','tp_brand')
    AND brand_id = crm_thacoauto.get_my_brand_id()
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','tp_showroom')
    AND showroom_id = crm_thacoauto.get_my_showroom_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
)
WITH CHECK (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','tp_brand')
    AND brand_id = crm_thacoauto.get_my_brand_id()
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','tp_showroom')
    AND showroom_id = crm_thacoauto.get_my_showroom_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
);

-- INSERT: tạo lead thủ công — chỉ vai trò có quyền tạo (CAN_CREATE_LEAD), trong phạm vi
DROP POLICY IF EXISTS leads_insert ON crm_thacoauto.leads;
CREATE POLICY leads_insert ON crm_thacoauto.leads FOR INSERT
WITH CHECK (
  crm_thacoauto.get_my_role() IN ('admin','gd_cty')
    AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() IN ('gd_brand','tp_brand')
    AND brand_id = crm_thacoauto.get_my_brand_id()
  OR crm_thacoauto.get_my_role() IN ('gd_showroom','tp_showroom')
    AND showroom_id = crm_thacoauto.get_my_showroom_id()
);

-- lead_logs INSERT: ghi log cho lead mà mình thấy được (EXISTS bị leads_select gác),
-- và actor là chính mình.
DROP POLICY IF EXISTS lead_logs_insert ON crm_thacoauto.lead_logs;
CREATE POLICY lead_logs_insert ON crm_thacoauto.lead_logs FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM crm_thacoauto.leads l WHERE l.id = lead_id)
);
