-- CRM THACO Auto — schema cô lập crm_thacoauto (scope B khung dự án)
CREATE SCHEMA IF NOT EXISTS crm_thacoauto;

-- 1. companies (tenant)
CREATE TABLE crm_thacoauto.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. brands (data-driven, mở rộng sau)
CREATE TABLE crm_thacoauto.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. showrooms
CREATE TABLE crm_thacoauto.showrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES crm_thacoauto.companies(id),
  brand_id uuid NOT NULL REFERENCES crm_thacoauto.brands(id),
  name text NOT NULL,
  code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. users (hồ sơ + vai trò CRM; id = auth.users.id)
CREATE TABLE crm_thacoauto.users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','manager','tvbh')),
  company_id uuid REFERENCES crm_thacoauto.companies(id),
  showroom_id uuid REFERENCES crm_thacoauto.showrooms(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. channel_accounts (sổ đăng ký kênh: page_id → showroom·brand·campaign)
CREATE TABLE crm_thacoauto.channel_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'facebook',
  page_id text UNIQUE NOT NULL,
  page_name text,
  showroom_id uuid NOT NULL REFERENCES crm_thacoauto.showrooms(id),
  brand_id uuid NOT NULL REFERENCES crm_thacoauto.brands(id),
  campaign text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. leads (lõi)
CREATE TABLE crm_thacoauto.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES crm_thacoauto.companies(id),
  showroom_id uuid REFERENCES crm_thacoauto.showrooms(id),
  brand_id uuid NOT NULL REFERENCES crm_thacoauto.brands(id),
  channel_account_id uuid REFERENCES crm_thacoauto.channel_accounts(id),
  assigned_to uuid REFERENCES crm_thacoauto.users(id),
  phone text NOT NULL,            -- chuẩn hoá +84
  phone_raw text,
  full_name text,
  source text,
  status text NOT NULL DEFAULT 'KHQT' CHECK (status IN ('KHQT','GDTD','KHĐ','Chưa LH được','Fail')),
  round int NOT NULL DEFAULT 1 CHECK (round BETWEEN 1 AND 3),
  fb_lead_id text,
  external_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_contact_at timestamptz,
  next_contact_at timestamptz,
  UNIQUE (phone, brand_id)        -- chống trùng theo từng thương hiệu
);
CREATE INDEX leads_assigned_idx ON crm_thacoauto.leads(assigned_to);
CREATE INDEX leads_showroom_idx ON crm_thacoauto.leads(showroom_id);

-- 7. lead_logs
CREATE TABLE crm_thacoauto.lead_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES crm_thacoauto.leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES crm_thacoauto.users(id),
  type text NOT NULL DEFAULT 'note' CHECK (type IN ('note','status_change','contact','system')),
  content text,
  old_status text,
  new_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. notifications (hàng đợi — CHƯA nối kênh)
CREATE TABLE crm_thacoauto.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES crm_thacoauto.leads(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'zalo',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

-- Helper functions (trong crm_thacoauto — KHÔNG public để tránh đụng Budget)
CREATE OR REPLACE FUNCTION crm_thacoauto.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'crm_thacoauto','public','auth','pg_catalog'
AS $$ SELECT role FROM crm_thacoauto.users WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION crm_thacoauto.get_my_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'crm_thacoauto','public','auth','pg_catalog'
AS $$ SELECT company_id FROM crm_thacoauto.users WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION crm_thacoauto.get_my_showroom_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'crm_thacoauto','public','auth','pg_catalog'
AS $$ SELECT showroom_id FROM crm_thacoauto.users WHERE id = auth.uid() $$;

-- RLS trên leads
ALTER TABLE crm_thacoauto.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_select ON crm_thacoauto.leads FOR SELECT
USING (
  crm_thacoauto.get_my_role() = 'admin' AND company_id = crm_thacoauto.get_my_company_id()
  OR crm_thacoauto.get_my_role() = 'manager' AND showroom_id = crm_thacoauto.get_my_showroom_id()
  OR crm_thacoauto.get_my_role() = 'tvbh' AND assigned_to = auth.uid()
);

-- RLS trên users (mỗi người đọc hồ sơ của mình + cùng company nếu manager/admin)
ALTER TABLE crm_thacoauto.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_select_self ON crm_thacoauto.users FOR SELECT
USING (
  id = auth.uid()
  OR crm_thacoauto.get_my_role() IN ('admin','manager') AND company_id = crm_thacoauto.get_my_company_id()
);

-- RLS trên lead_logs (theo lead mình thấy được)
ALTER TABLE crm_thacoauto.lead_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_logs_select ON crm_thacoauto.lead_logs FOR SELECT
USING (EXISTS (SELECT 1 FROM crm_thacoauto.leads l WHERE l.id = lead_id));

-- Master catalog (companies/brands/showrooms/channel_accounts) — không bật RLS,
-- chỉ service_role + đọc nội bộ; client không ghi trực tiếp. (cố ý OFF)

-- Seed: company + brands + 1 showroom test
INSERT INTO crm_thacoauto.companies (name, slug)
VALUES ('Thaco Auto Hà Nội', 'thaco-auto-hanoi');

INSERT INTO crm_thacoauto.brands (name, slug) VALUES
  ('KIA', 'kia'), ('Mazda', 'mazda');

INSERT INTO crm_thacoauto.showrooms (company_id, brand_id, name, code)
SELECT c.id, b.id, 'KIA Hà Nội (test)', 'KIA-HN-01'
FROM crm_thacoauto.companies c, crm_thacoauto.brands b
WHERE c.slug = 'thaco-auto-hanoi' AND b.slug = 'kia';
