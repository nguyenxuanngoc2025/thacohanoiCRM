-- 0027_google_sheets.sql — nguồn lead Google Sheet
CREATE TABLE IF NOT EXISTS crm_thacoauto.google_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL UNIQUE,
  google_email      text,
  refresh_token_enc text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_thacoauto.google_connections IS 'Grant OAuth Google (drive.file) mỗi công ty. refresh_token mã hoá AES-256-GCM. Chỉ service_role chạm tới.';
ALTER TABLE crm_thacoauto.google_connections ENABLE ROW LEVEL SECURITY;
-- KHÔNG policy cho anon/authenticated → client không đọc/ghi (token là bí mật).
GRANT ALL ON crm_thacoauto.google_connections TO service_role;

ALTER TABLE crm_thacoauto.channel_accounts ADD COLUMN IF NOT EXISTS config jsonb;
COMMENT ON COLUMN crm_thacoauto.channel_accounts.config IS 'Cấu hình riêng kênh google_sheet: { connection_id, tab, range, phone_col, name_col, note_cols }';

NOTIFY pgrst, 'reload schema';
