-- 0020: Lõi quản trị nền tảng
-- - Thêm vai trò platform_owner (chủ nền tảng, company_id NULL)
-- - companies.max_showrooms (quota số showroom)
-- - bảng company_brands (whitelist thương hiệu mỗi công ty được cấp)
-- - seed quota + brands cho công ty đang tồn tại để không "vượt quota" ngay
-- Idempotent.

SET search_path TO crm_thacoauto, public;

-- 1) Mở rộng CHECK role: thêm platform_owner
ALTER TABLE crm_thacoauto.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE crm_thacoauto.users ADD CONSTRAINT users_role_check CHECK (role IN (
  'platform_owner',  -- Chủ nền tảng: quản trị toàn bộ công ty (company_id NULL)
  'admin',
  'gd_cty', 'mkt_cty',
  'gd_brand', 'mkt_brand', 'tp_brand',
  'gd_showroom', 'mkt_showroom', 'tp_showroom',
  'tvbh'
));

-- 2) Quota số showroom (0 = chưa cấu hình)
ALTER TABLE crm_thacoauto.companies
  ADD COLUMN IF NOT EXISTS max_showrooms int NOT NULL DEFAULT 0;

-- 3) Whitelist thương hiệu mỗi công ty
CREATE TABLE IF NOT EXISTS crm_thacoauto.company_brands (
  company_id uuid NOT NULL REFERENCES crm_thacoauto.companies(id) ON DELETE CASCADE,
  brand_id   uuid NOT NULL REFERENCES crm_thacoauto.brands(id)    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, brand_id)
);

-- 4) GRANT (Gotcha #5)
GRANT ALL ON crm_thacoauto.company_brands TO anon, authenticated, service_role;

-- 5) RLS: chỉ service_role ghi; user cùng công ty được đọc (UI công ty biết mình được cấp brand nào)
ALTER TABLE crm_thacoauto.company_brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_brands_select ON crm_thacoauto.company_brands;
CREATE POLICY company_brands_select ON crm_thacoauto.company_brands FOR SELECT
USING ( company_id = crm_thacoauto.get_my_company_id() );
-- (không có policy INSERT/UPDATE/DELETE cho client → chỉ service_role ghi được)

-- 6) Seed công ty đang tồn tại: max_showrooms = số showroom hiện có + 2 (biên), tối thiểu 2
UPDATE crm_thacoauto.companies c
SET max_showrooms = GREATEST(2, (
  SELECT count(*) FROM crm_thacoauto.showrooms s WHERE s.company_id = c.id
)::int + 2)
WHERE c.max_showrooms = 0;

-- 7) Seed brands được cấp cho mỗi công ty = các brand mà showroom của công ty đó đang bán
INSERT INTO crm_thacoauto.company_brands (company_id, brand_id)
SELECT DISTINCT s.company_id, sb.brand_id
FROM crm_thacoauto.showrooms s
JOIN crm_thacoauto.showroom_brands sb ON sb.showroom_id = s.id
WHERE s.company_id IS NOT NULL
ON CONFLICT (company_id, brand_id) DO NOTHING;

-- 8) PostgREST nạp lại schema cache
NOTIFY pgrst, 'reload schema';
