-- 0073: dọn bản ghi TRÙNG trong kpi_model_map do lệch hoa/thường + gõ sai
-- (vd 'Mazda' vs 'MAZDA', 'New Canrival' vs 'New Carnival'). Các bản ghi lệch này
-- KHÔNG khớp danh mục chuẩn budget (master_models) nên gây nhập nhằng:
--   • rev_map/brand_map trong get_kpi_targets có thể quy actuals về TÊN LỆCH ⇒ tách nhóm hãng,
--   • nhiều dòng budget cùng crm_model_id ⇒ fan-out đếm đôi khi FULL OUTER JOIN.
--
-- Quy tắc AN TOÀN + idempotent: chỉ TẮT (active=false) một bản ghi khi
--   (a) tên (brand,model) của nó KHÔNG có trong master_models, VÀ
--   (b) TỒN TẠI bản ghi anh em (cùng company + crm_model_id) có tên KHỚP master_models.
-- ⇒ luôn giữ lại đúng 1 bản chuẩn; không bao giờ tắt nhầm mapping duy nhất.
UPDATE crm_thacoauto.kpi_model_map km
SET active = false
WHERE km.active
  AND km.crm_model_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM mkt_budget.master_models mm
    WHERE mm.brand_name = km.budget_brand_name
      AND mm.name       = km.budget_model_name
  )
  AND EXISTS (
    SELECT 1
    FROM crm_thacoauto.kpi_model_map k2
    JOIN mkt_budget.master_models mm2
      ON mm2.brand_name = k2.budget_brand_name
     AND mm2.name       = k2.budget_model_name
    WHERE k2.company_id  = km.company_id
      AND k2.crm_model_id = km.crm_model_id
      AND k2.active
      AND k2.id <> km.id
  );
