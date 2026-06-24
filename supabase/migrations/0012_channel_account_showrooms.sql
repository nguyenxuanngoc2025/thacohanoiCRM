-- 0012_channel_account_showrooms.sql
-- 1 Fanpage Facebook có thể phục vụ NHIỀU showroom (vd Tải Bus → Đài Tư, Chương Mỹ, Giải Phóng).
-- Lead về từ fanpage được chia ĐỀU cho các showroom (cấp 1), rồi trong showroom mới chia cho TVBH (cấp 2).
-- Cột channel_accounts.showroom_id giữ lại làm "anchor" (showroom mặc định), junction bổ sung quan hệ nhiều showroom.
-- Idempotent.

SET search_path TO crm_thacoauto, public;

-- 1) Bảng junction channel_account ↔ showroom
CREATE TABLE IF NOT EXISTS crm_thacoauto.channel_account_showrooms (
  channel_account_id uuid NOT NULL REFERENCES crm_thacoauto.channel_accounts(id) ON DELETE CASCADE,
  showroom_id        uuid NOT NULL REFERENCES crm_thacoauto.showrooms(id)        ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_account_id, showroom_id)
);

-- 2) GRANTs (Gotcha #5)
GRANT USAGE ON SCHEMA crm_thacoauto TO anon, authenticated, service_role;
GRANT ALL ON crm_thacoauto.channel_account_showrooms TO anon, authenticated, service_role;
-- RLS OFF cố ý: cấu hình kênh — chỉ admin ghi qua service_role.

-- 3) Cập nhật channel placeholder thành fanpage Tải Bus thật
UPDATE crm_thacoauto.channel_accounts
SET page_id   = '433432613872953',
    page_name = 'THACO AUTO Hà Nội - Tải Bus',
    brand_id  = 'e2f64d29-d337-411d-a8be-f745816c1d99', -- Tải Bus
    showroom_id = 'c19bc127-f021-4970-9c50-96edce0a38af' -- anchor: Giải Phóng
WHERE id = '4359f3c5-e620-41e8-8966-38a2c07de022';

-- 4) Seed junction: fanpage Tải Bus → 3 showroom (Đài Tư, Chương Mỹ, Giải Phóng)
INSERT INTO crm_thacoauto.channel_account_showrooms (channel_account_id, showroom_id)
VALUES
  ('4359f3c5-e620-41e8-8966-38a2c07de022', 'a4e38658-fc57-4179-805d-0cd68dd8de5c'), -- Đài Tư
  ('4359f3c5-e620-41e8-8966-38a2c07de022', '597e3a58-d864-4bf6-b04d-c50aa11adaf6'), -- Chương Mỹ
  ('4359f3c5-e620-41e8-8966-38a2c07de022', 'c19bc127-f021-4970-9c50-96edce0a38af')  -- Giải Phóng
ON CONFLICT (channel_account_id, showroom_id) DO NOTHING;
