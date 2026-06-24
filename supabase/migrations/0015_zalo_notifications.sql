-- 0015: Mở rộng thông báo nhóm Zalo (per-showroom + nhóm BLĐ + retry)
-- Schema crm_thacoauto. Áp qua skill supabase-self-hosted-ops (docker exec psql).

-- notification_channels: gắn nhóm với showroom + phân biệt nhóm BLĐ
ALTER TABLE crm_thacoauto.notification_channels
  ADD COLUMN IF NOT EXISTS showroom_id uuid REFERENCES crm_thacoauto.showrooms(id),
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'showroom'
    CHECK (scope IN ('showroom','management'));

-- notifications: nối kênh + retry
ALTER TABLE crm_thacoauto.notifications
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES crm_thacoauto.notification_channels(id),
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;

-- Index cho zca-bot poll nhanh hàng đợi pending
CREATE INDEX IF NOT EXISTS notifications_pending_idx
  ON crm_thacoauto.notifications(status) WHERE status = 'pending';

-- Grants (Gotcha #5 — cột mới phủ bởi default privileges nhưng GRANT lại cho chắc)
GRANT ALL ON crm_thacoauto.notification_channels TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.notifications          TO anon, authenticated, service_role;
