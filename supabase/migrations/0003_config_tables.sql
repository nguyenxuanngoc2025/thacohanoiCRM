-- CRM THACO Auto — bảng cấu hình: phân giao, SLA, kênh thông báo
-- Schema cô lập crm_thacoauto. Master-config: RLS OFF (chỉ service_role ghi qua API
-- guard admin; settings page guard admin ở app layer). Đồng bộ pattern channel_accounts/showrooms.

-- 9. assignment_rules (luật phân giao lead cho TVBH)
CREATE TABLE IF NOT EXISTS crm_thacoauto.assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES crm_thacoauto.companies(id),
  showroom_id uuid REFERENCES crm_thacoauto.showrooms(id),  -- NULL = mặc định toàn công ty
  strategy text NOT NULL DEFAULT 'least_loaded'
    CHECK (strategy IN ('least_loaded','specific_user')),
  specific_user_id uuid REFERENCES crm_thacoauto.users(id), -- dùng khi strategy='specific_user'
  is_active boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 0,                           -- rule showroom (priority cao) ưu tiên hơn mặc định
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignment_rules_showroom_idx ON crm_thacoauto.assignment_rules(showroom_id);

-- 10. sla_config (thời hạn phản hồi theo vòng)
CREATE TABLE IF NOT EXISTS crm_thacoauto.sla_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES crm_thacoauto.companies(id),
  round int NOT NULL CHECK (round BETWEEN 1 AND 3),
  first_response_hours int NOT NULL DEFAULT 2,   -- giờ phải liên hệ lần đầu sau khi nhận lead
  follow_up_hours int NOT NULL DEFAULT 24,       -- giờ giữa các lần chăm sóc tiếp theo
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (company_id, round)
);

-- 11. notification_channels (định nghĩa kênh thông báo — queue notifications tiêu thụ)
CREATE TABLE IF NOT EXISTS crm_thacoauto.notification_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES crm_thacoauto.companies(id),
  channel text NOT NULL CHECK (channel IN ('zalo','telegram')),
  name text NOT NULL,
  target text,                                   -- group id / chat id
  events text[] NOT NULL DEFAULT ARRAY['new_lead']::text[],  -- sự kiện kích hoạt
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Grants (Gotcha #5: bảng mới cần GRANT rõ; default privileges 0001 cũng phủ, thêm cho chắc)
GRANT ALL ON crm_thacoauto.assignment_rules      TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.sla_config            TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.notification_channels TO anon, authenticated, service_role;

-- Seed mặc định cho công ty Thaco Auto Hà Nội
-- Phân giao: 1 rule mặc định toàn công ty (least_loaded)
INSERT INTO crm_thacoauto.assignment_rules (company_id, showroom_id, strategy, is_active, priority)
SELECT c.id, NULL, 'least_loaded', true, 0
FROM crm_thacoauto.companies c
WHERE c.slug = 'thaco-auto-hanoi'
  AND NOT EXISTS (
    SELECT 1 FROM crm_thacoauto.assignment_rules r
    WHERE r.company_id = c.id AND r.showroom_id IS NULL
  );

-- SLA: 3 vòng (mốc hợp lý: vòng 1 phản hồi nhanh 2h, follow-up 24h)
INSERT INTO crm_thacoauto.sla_config (company_id, round, first_response_hours, follow_up_hours, is_active)
SELECT c.id, r.round, r.frh, r.fuh, true
FROM crm_thacoauto.companies c
CROSS JOIN (VALUES (1, 2, 24), (2, 4, 48), (3, 8, 72)) AS r(round, frh, fuh)
WHERE c.slug = 'thaco-auto-hanoi'
ON CONFLICT (company_id, round) DO NOTHING;

-- Thông báo: 1 kênh Zalo mặc định (giữ hành vi hiện tại của ingestLead)
INSERT INTO crm_thacoauto.notification_channels (company_id, channel, name, events, is_active)
SELECT c.id, 'zalo', 'Zalo nhóm CSKH (mặc định)', ARRAY['new_lead']::text[], true
FROM crm_thacoauto.companies c
WHERE c.slug = 'thaco-auto-hanoi'
  AND NOT EXISTS (
    SELECT 1 FROM crm_thacoauto.notification_channels n WHERE n.company_id = c.id
  );
