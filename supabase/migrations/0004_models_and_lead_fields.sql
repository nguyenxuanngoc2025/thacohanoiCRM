-- 0004: bảng models (dòng xe theo thương hiệu) + cột leads.model_id, last_note
BEGIN;

-- Bảng dòng xe (master catalog, quản lý động trong Cài đặt)
CREATE TABLE IF NOT EXISTS crm_thacoauto.models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES crm_thacoauto.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS models_brand_idx ON crm_thacoauto.models(brand_id);
-- Master catalog: RLS OFF cố ý (chỉ service_role ghi qua API guard admin; client đọc nội bộ).

-- Lead: dòng xe quan tâm + nội dung liên hệ gần nhất (denormalize để hiện nhanh trên bảng)
ALTER TABLE crm_thacoauto.leads
  ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES crm_thacoauto.models(id),
  ADD COLUMN IF NOT EXISTS last_note text;

-- Grants (RLS vẫn gác; GRANT mở cổng bảng mới)
GRANT ALL ON crm_thacoauto.models TO anon, authenticated, service_role;

-- Seed dòng xe KIA + Mazda (import từ danh mục dự án Budget). Chỉ KIA/Mazda; mở rộng sau.
INSERT INTO crm_thacoauto.models (brand_id, name, sort_order)
SELECT b.id, m.name, m.ord
FROM crm_thacoauto.brands b
JOIN (
  VALUES
    ('kia', 'New Carnival', 1),
    ('kia', 'Sportage', 2),
    ('kia', 'Carens', 3),
    ('kia', 'New Sonet', 4),
    ('kia', 'New Seltos', 5),
    ('kia', 'New Sorento', 6),
    ('kia', 'K5', 7),
    ('kia', 'New Morning', 8),
    ('kia', 'K3', 9),
    ('kia', 'Soluto', 10),
    ('mazda', 'CX-90', 1),
    ('mazda', 'MX-5', 2),
    ('mazda', 'CX-8', 3),
    ('mazda', 'CX-5', 4),
    ('mazda', 'Mazda3', 5),
    ('mazda', 'CX-3', 6),
    ('mazda', 'CX-30', 7),
    ('mazda', 'Mazda2', 8)
) AS m(brand_slug, name, ord) ON b.slug = m.brand_slug
WHERE NOT EXISTS (
  SELECT 1 FROM crm_thacoauto.models x WHERE x.brand_id = b.id AND x.name = m.name
);

SELECT 'OK' AS status, (SELECT count(*) FROM crm_thacoauto.models) AS models_count;

COMMIT;
