-- 0063: Bảng ánh xạ dòng xe budget (text) -> model CRM (uuid). Chỉ tenant Thaco Auto HN.
CREATE TABLE IF NOT EXISTS crm_thacoauto.kpi_model_map (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES crm_thacoauto.companies(id) ON DELETE CASCADE,
  budget_brand_name text NOT NULL,
  budget_model_name text NOT NULL,
  crm_model_id      uuid REFERENCES crm_thacoauto.models(id) ON DELETE SET NULL, -- NULL = bỏ qua
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, budget_brand_name, budget_model_name)
);

ALTER TABLE crm_thacoauto.kpi_model_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kpi_model_map_rw ON crm_thacoauto.kpi_model_map;
CREATE POLICY kpi_model_map_rw ON crm_thacoauto.kpi_model_map
  FOR ALL TO authenticated
  USING (company_id = crm_thacoauto.get_my_company_id())
  WITH CHECK (company_id = crm_thacoauto.get_my_company_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON crm_thacoauto.kpi_model_map TO authenticated, service_role;
