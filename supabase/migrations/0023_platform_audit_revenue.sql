-- 0023: Nhật ký nền tảng (Đợt 2) + module doanh thu/hợp đồng (Đợt 3)
-- - platform_audit_log: ghi mọi thao tác platform_owner (đổi quota, khóa/mở, tạo cty, hợp đồng)
-- - platform_contracts / platform_payment_schedule / platform_payments: kinh doanh của chủ nền tảng
-- Tất cả: dữ liệu RIÊNG chủ nền tảng → RLS bật, KHÔNG policy client (chỉ service_role qua route đã verify role).
-- Idempotent.

SET search_path TO crm_thacoauto, public;

-- 1) Nhật ký thao tác
CREATE TABLE IF NOT EXISTS crm_thacoauto.platform_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NULL,                       -- platform_owner thực hiện (NULL nếu hệ thống)
  action      text NOT NULL,                   -- vd 'company.create', 'company.quota', 'company.suspend', 'contract.create'
  target_type text NOT NULL,                   -- vd 'company', 'contract'
  target_id   uuid NULL,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_audit_log_created_idx
  ON crm_thacoauto.platform_audit_log (created_at DESC);

-- 2) Hợp đồng bán CRM
CREATE TABLE IF NOT EXISTS crm_thacoauto.platform_contracts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NULL REFERENCES crm_thacoauto.companies(id) ON DELETE SET NULL,
  prospect_name  text NULL,
  plan_label     text NULL,
  contract_value numeric(14,2) NOT NULL DEFAULT 0,
  currency       text NOT NULL DEFAULT 'VND',
  signed_at      date NULL,
  term_months    int NULL,
  expiry_date    date NULL,
  status         text NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect','active','expired','churned')),
  notes          text NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_contracts_company_idx
  ON crm_thacoauto.platform_contracts (company_id);

-- 3) Lịch thu dự kiến từng đợt
CREATE TABLE IF NOT EXISTS crm_thacoauto.platform_payment_schedule (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES crm_thacoauto.platform_contracts(id) ON DELETE CASCADE,
  due_date    date NOT NULL,
  amount      numeric(14,2) NOT NULL,
  note        text NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_payment_schedule_contract_idx
  ON crm_thacoauto.platform_payment_schedule (contract_id);

-- 4) Thực nhận từng lần
CREATE TABLE IF NOT EXISTS crm_thacoauto.platform_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES crm_thacoauto.platform_contracts(id) ON DELETE CASCADE,
  paid_at     date NOT NULL,
  amount      numeric(14,2) NOT NULL,
  method      text NULL,
  note        text NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_payments_contract_idx
  ON crm_thacoauto.platform_payments (contract_id);

-- 5) GRANT (Gotcha #5). service_role bypass RLS để route admin (đã verify role) truy cập.
--    Cấp cho anon/authenticated để PostgREST không lỗi 42501 ở tầng schema; RLS (không policy) vẫn chặn.
GRANT ALL ON crm_thacoauto.platform_audit_log         TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.platform_contracts         TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.platform_payment_schedule  TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.platform_payments          TO anon, authenticated, service_role;

-- 6) RLS bật, KHÔNG policy cho client → anon/authenticated bị chặn hoàn toàn; chỉ service_role (bypass) đọc/ghi.
ALTER TABLE crm_thacoauto.platform_audit_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_thacoauto.platform_contracts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_thacoauto.platform_payment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_thacoauto.platform_payments         ENABLE ROW LEVEL SECURITY;

-- 7) PostgREST nạp lại schema cache
NOTIFY pgrst, 'reload schema';
