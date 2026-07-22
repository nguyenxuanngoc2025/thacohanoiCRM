-- 0062: Web Push cá nhân (PWA) — mỗi bản ghi = 1 thiết bị đã đăng ký nhận push của 1 user.
-- Schema crm_thacoauto. Áp qua skill supabase-self-hosted-ops (docker exec psql), sau đó
-- `docker compose up -d rest` để PostgREST expose bảng mới.

CREATE TABLE IF NOT EXISTS crm_thacoauto.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES crm_thacoauto.users(id) ON DELETE CASCADE,
  company_id   uuid REFERENCES crm_thacoauto.companies(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx    ON crm_thacoauto.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_company_idx ON crm_thacoauto.push_subscriptions(company_id);

-- RLS: user chỉ đọc/ghi/xoá đăng ký của CHÍNH MÌNH. service_role (server gửi push) bỏ qua RLS.
ALTER TABLE crm_thacoauto.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_sub_select ON crm_thacoauto.push_subscriptions;
CREATE POLICY push_sub_select ON crm_thacoauto.push_subscriptions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_sub_insert ON crm_thacoauto.push_subscriptions;
CREATE POLICY push_sub_insert ON crm_thacoauto.push_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_sub_delete ON crm_thacoauto.push_subscriptions;
CREATE POLICY push_sub_delete ON crm_thacoauto.push_subscriptions FOR DELETE
  USING (user_id = auth.uid());

-- Grants (Gotcha #5 — schema mới/bảng mới cần GRANT tường minh, RLS vẫn gác từng dòng).
GRANT USAGE ON SCHEMA crm_thacoauto TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.push_subscriptions TO anon, authenticated, service_role;
