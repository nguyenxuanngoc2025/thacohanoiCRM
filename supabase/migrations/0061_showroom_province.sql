-- 0061: Định tuyến lead theo địa chỉ + bổ sung từ khoá dòng xe (tình huống Google Sheet).
-- 1) Thuộc tính "tỉnh/khu vực" cho showroom (để định tuyến lead theo cột địa chỉ trong sheet).
-- 2) Bổ sung từ khoá dò dòng xe cho nhóm xe tải (mã agency ghi: k200/k250/towner…).

-- ── 1) Tỉnh cho showroom ────────────────────────────────────────────────────
ALTER TABLE crm_thacoauto.showrooms
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS province_aliases text[] NOT NULL DEFAULT '{}';

-- Seed tỉnh cho các showroom Thaco Auto Hà Nội hiện có (theo id).
UPDATE crm_thacoauto.showrooms
   SET province = 'Ninh Bình', province_aliases = ARRAY['ninh binh']
 WHERE id = '3eac9c25-d10d-47ab-9d3e-70f9aef599e2';

UPDATE crm_thacoauto.showrooms
   SET province = 'Hà Nam', province_aliases = ARRAY['ha nam']
 WHERE id = '75b83b4a-7068-42a0-8dff-192a8f60bee1';

UPDATE crm_thacoauto.showrooms
   SET province = 'Hà Nội', province_aliases = ARRAY['ha noi', 'hanoi', 'hn', 'thu do']
 WHERE id IN (
   '027538dc-c4bf-4243-b5b4-aeb4b47a111a', -- BMW Lê Duẩn
   'c54552b1-47a1-4c48-b667-eb977a15c0b1', -- BMW Lê Văn Lương
   '3cb55274-23a8-4def-a1e9-134eb7ab82f9', -- BMW Long Biên
   '597e3a58-d864-4bf6-b04d-c50aa11adaf6', -- Chương Mỹ
   'a4e38658-fc57-4179-805d-0cd68dd8de5c', -- Đài Tư
   '807e2da4-2672-409c-a268-0f0905ae276d', -- Đông Trù
   'c19bc127-f021-4970-9c50-96edce0a38af', -- Giải Phóng
   '58b11549-3b81-4ebd-b323-a4790dd550d0', -- Nguyễn Văn Cừ
   'fb43c791-53f5-4605-925e-2f86e08e7513', -- Phạm Văn Đồng
   'ab923b85-b4c5-449f-b1a6-01f96d1173c4'  -- Trần Khát Chân
 );

-- ── 2) Từ khoá dò dòng xe (tình huống 2) ────────────────────────────────────
-- Rà trước theo dữ liệu sẵn có; user bổ sung sau. Chỉ thêm mã CHẮC CHẮN, không chồng lấn.
-- K-series (Thaco Kia) = tải nhẹ máy DẦU → k200/k250/k250l.
UPDATE crm_thacoauto.models m
   SET keywords = ARRAY(SELECT DISTINCT unnest(m.keywords || ARRAY['k200','k250','k250l','k200l']))
  FROM crm_thacoauto.brands b
 WHERE b.id = m.brand_id AND b.name = 'Tải Bus' AND m.name = 'Tải nhẹ máy dầu';

-- Towner (Thaco Towner) = tải nhẹ máy XĂNG → towner/thaco towner.
UPDATE crm_thacoauto.models m
   SET keywords = ARRAY(SELECT DISTINCT unnest(m.keywords || ARRAY['towner','thaco towner','towner800','towner990']))
  FROM crm_thacoauto.brands b
 WHERE b.id = m.brand_id AND b.name = 'Tải Bus' AND m.name = 'Tải nhẹ máy xăng';
