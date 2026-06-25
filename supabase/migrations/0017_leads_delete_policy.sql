-- 0017: Policy XOÁ lead — CHỈ admin. Trước đây không có DELETE policy nên mọi
-- DELETE qua tài khoản đăng nhập bị RLS chặn âm thầm (xoá 0 dòng). Bảng con
-- lead_logs/lead_notes có ON DELETE CASCADE nên xoá lead sẽ tự dọn log.
-- Server action deleteLeads vẫn kiểm tra role admin trước (phòng vệ 2 lớp).

DROP POLICY IF EXISTS leads_delete ON crm_thacoauto.leads;
CREATE POLICY leads_delete ON crm_thacoauto.leads FOR DELETE
USING (
  crm_thacoauto.get_my_role() = 'admin'
  AND company_id = crm_thacoauto.get_my_company_id()
);
