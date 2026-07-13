-- 0049: Danh mục Nguồn & Chi tiết kênh lead — TỰ QUẢN LÝ tại /admin.
-- Thay hằng số gắn cứng lib/platforms.ts + lib/source.ts. Toàn cục (không company_id),
-- chỉ platform_owner ghi (qua route service_role). RLS SELECT cho mọi role đăng nhập.
SET search_path TO crm_thacoauto, public;

CREATE TABLE IF NOT EXISTS crm_thacoauto.lead_source_channels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_key  text NOT NULL,
  platform_name text NOT NULL,
  value         text NOT NULL UNIQUE,
  label         text NOT NULL,
  is_builtin    boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  digital       boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed kênh hệ thống (khớp lib/source.ts + lib/platforms.ts hiện tại). is_builtin = true.
INSERT INTO crm_thacoauto.lead_source_channels
  (platform_key, platform_name, value, label, is_builtin, is_active, digital, sort_order)
VALUES
  ('facebook',    'Facebook',            'facebook',            'Lead Ads',    true, true, true, 10),
  ('facebook',    'Facebook',            'fb_message',          'Tin nhắn',    true, true, true, 11),
  ('facebook',    'Facebook',            'fb_comment',          'Bình luận',   true, true, true, 12),
  ('website',     'Website form',        'Website form',        'Mặc định',    true, true, true, 20),
  ('zalo',        'Zalo OA',             'zalo',                'Tin nhắn OA', true, true, true, 30),
  ('zalo',        'Zalo OA',             'zalo_ads',            'Quảng cáo',   true, true, true, 31),
  ('google_sheet','Google Sheet',        'google_sheet',        'Google Sheet',true, true, true, 40),
  ('google',      'Google (gọi hotline)','Google (gọi hotline)','Mặc định',    true, true, true, 50)
ON CONFLICT (value) DO NOTHING;

ALTER TABLE crm_thacoauto.lead_source_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lsc_select ON crm_thacoauto.lead_source_channels;
CREATE POLICY lsc_select ON crm_thacoauto.lead_source_channels
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- GRANT (Gotcha #5 — schema/bảng mới cần mở cổng cho PostgREST role).
GRANT USAGE ON SCHEMA crm_thacoauto TO anon, authenticated, service_role;
GRANT SELECT ON crm_thacoauto.lead_source_channels TO anon, authenticated;
GRANT ALL ON crm_thacoauto.lead_source_channels TO service_role;

NOTIFY pgrst, 'reload schema';
