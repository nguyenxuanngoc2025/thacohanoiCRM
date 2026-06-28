-- 0026: bảng cấu hình nền tảng (key-value singleton) — vd fb_business_id để hiển thị trong hướng dẫn.
CREATE TABLE IF NOT EXISTS crm_thacoauto.platform_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE crm_thacoauto.platform_settings IS
  'Cấu hình cấp nền tảng (dùng chung mọi công ty). vd fb_business_id = Business ID của BM nền tảng.';

-- RLS: ai đăng nhập cũng ĐỌC được (admin công ty cần fb_business_id cho hướng dẫn FB);
-- GHI chỉ qua service_role (API guarded platform_owner) — không có policy write nên client thường bị chặn.
ALTER TABLE crm_thacoauto.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_settings_read ON crm_thacoauto.platform_settings;
CREATE POLICY platform_settings_read ON crm_thacoauto.platform_settings
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON crm_thacoauto.platform_settings TO anon, authenticated;
GRANT ALL    ON crm_thacoauto.platform_settings TO service_role;

NOTIFY pgrst, 'reload schema';
