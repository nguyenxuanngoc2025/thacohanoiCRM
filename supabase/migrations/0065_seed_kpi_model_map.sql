-- Seed crm_thacoauto.kpi_model_map cho tenant Thaco Auto HN.
-- Ánh xạ (brand_name, model_name) trong mkt_budget.budget_entries -> crm_thacoauto.models.
-- Tự khớp theo tên (chuẩn hoá brand MAZDA->Mazda) + alias thủ công.
-- Dòng budget không khớp (Key Showroom, Quảng cáo chung, BMW MTR, DVPT*, Jeep) -> bỏ qua (loại khỏi báo cáo).

WITH hn AS (
  SELECT 'ec6b9c22-1317-4884-a496-cf0793d6c7b8'::uuid AS company_id
),
be AS (
  SELECT DISTINCT brand_name, model_name FROM mkt_budget.budget_entries
),
resolved AS (
  SELECT
    be.brand_name AS budget_brand_name,
    be.model_name AS budget_model_name,
    m.id          AS crm_model_id
  FROM be
  JOIN crm_thacoauto.brands b
    ON lower(b.name) = lower(CASE WHEN be.brand_name = 'MAZDA' THEN 'Mazda' ELSE be.brand_name END)
  JOIN crm_thacoauto.models m
    ON m.brand_id = b.id
   AND lower(m.name) = lower(
         CASE
           WHEN be.model_name = 'Kia K5'       THEN 'K5'
           WHEN be.model_name = 'New Canrival' THEN 'New Carnival'
           WHEN be.model_name = 'Mazda CX-5'   THEN 'CX-5'
           WHEN be.model_name = 'Mazda CX-8'   THEN 'CX-8'
           ELSE be.model_name
         END)
)
INSERT INTO crm_thacoauto.kpi_model_map (company_id, budget_brand_name, budget_model_name, crm_model_id, active)
SELECT hn.company_id, r.budget_brand_name, r.budget_model_name, r.crm_model_id, true
FROM resolved r CROSS JOIN hn
ON CONFLICT (company_id, budget_brand_name, budget_model_name)
DO UPDATE SET crm_model_id = EXCLUDED.crm_model_id, active = true;
