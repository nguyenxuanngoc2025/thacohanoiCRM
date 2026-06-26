-- 0019: Multi-tenant — thêm cột định tuyến + branding + trạng thái gói cho companies
ALTER TABLE crm_thacoauto.companies
  ADD COLUMN IF NOT EXISTS subdomain     text UNIQUE,
  ADD COLUMN IF NOT EXISTS custom_domain text UNIQUE,
  ADD COLUMN IF NOT EXISTS branding      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS plan_status   text  NOT NULL DEFAULT 'active'
    CHECK (plan_status IN ('active','trial','suspended'));

-- Anchor: Thaco Auto Hà Nội giữ vanity domain + đặt subdomain 'hanoi'
UPDATE crm_thacoauto.companies
SET custom_domain = 'crm.thacoautohn-mkt.com',
    subdomain     = 'hanoi',
    branding      = jsonb_build_object('display_name','Thaco Auto Hà Nội')
WHERE slug = 'thaco-auto-hanoi';

-- PostgREST nạp lại schema cache (có cột mới)
NOTIFY pgrst, 'reload schema';
