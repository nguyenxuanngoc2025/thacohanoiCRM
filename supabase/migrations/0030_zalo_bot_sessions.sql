-- Phiên đăng nhập con bot Zalo (gửi thông báo) theo từng công ty.
-- 1 công ty = 1 tài khoản Zalo = 1 dòng. cred_enc mã hoá AES-256-GCM (TOKEN_ENC_KEY).
CREATE TABLE IF NOT EXISTS crm_thacoauto.zalo_bot_sessions (
  company_id   uuid PRIMARY KEY REFERENCES crm_thacoauto.companies(id) ON DELETE CASCADE,
  zalo_uid     text,
  display_name text,
  cred_enc     text,
  status       text NOT NULL DEFAULT 'disconnected'
                 CHECK (status IN ('connected','disconnected')),
  last_error   text,
  connected_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_thacoauto.zalo_bot_sessions ENABLE ROW LEVEL SECURITY;
-- RLS ENABLE không policy → chỉ service_role qua được (giống google_connections).
-- Cấp quyền schema (gotcha #5): mở cổng, RLS vẫn gác.
GRANT ALL ON crm_thacoauto.zalo_bot_sessions TO anon, authenticated, service_role;
