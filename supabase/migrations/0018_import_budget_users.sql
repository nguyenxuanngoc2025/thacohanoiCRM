-- 0018: Import 44 tài khoản từ app MKT Budget sang CRM (dùng CHUNG tài khoản đăng
-- nhập auth.users — login cả 2 app vẫn giữ nguyên). Chỉ thêm hồ sơ phía CRM.
-- Nguyên tắc: phụ trách thương hiệu/showroom nào → xem lead tới đó. Bỏ DVPT (không lead).
-- Map vai trò Budget → CRM; người giữ nhiều brand/showroom lấy cái đầu tiên hợp lệ.

-- 1) Thương hiệu CRM còn thiếu (được gán làm scope chính cho user) ──────────────
INSERT INTO crm_thacoauto.brands (name, slug)
SELECT v.name, v.slug FROM (VALUES
  ('BMW','bmw'), ('MINI','mini'), ('STELLANTIS','stellantis')
) AS v(name, slug)
WHERE NOT EXISTS (SELECT 1 FROM crm_thacoauto.brands b WHERE b.name = v.name);

-- 2) Showroom CRM còn thiếu (4 showroom BMW) ─────────────────────────────────────
INSERT INTO crm_thacoauto.showrooms (company_id, name, code)
SELECT 'ec6b9c22-1317-4884-a496-cf0793d6c7b8'::uuid, v.name, v.code FROM (VALUES
  ('BMW Lê Văn Lương','LVL'),
  ('Nguyễn Văn Cừ','NVC'),
  ('BMW Long Biên','BMWLB'),
  ('BMW Lê Duẩn','BMWLD')
) AS v(name, code)
WHERE NOT EXISTS (
  SELECT 1 FROM crm_thacoauto.showrooms s
  WHERE s.company_id = 'ec6b9c22-1317-4884-a496-cf0793d6c7b8'::uuid AND s.code = v.code
);

-- 3) Hồ sơ 44 user — gắn vào auth.users sẵn có (id = budget user id = auth id) ────
WITH src(email, crm_role, brand_name, sr_code) AS (VALUES
  -- Cấp công ty
  ('admin@thaco.com.vn',          'admin',   NULL, NULL),
  ('ngominhhieu@thaco.com.vn',    'gd_cty',  NULL, NULL),
  ('nguyenducthanh@thaco.com.vn', 'gd_cty',  NULL, NULL),
  ('nguyenducthong@thaco.com.vn', 'gd_cty',  NULL, NULL),
  ('nguyenvanlan@thaco.com.vn',   'gd_cty',  NULL, NULL),
  ('vuthithuy@thaco.com.vn',      'gd_cty',  NULL, NULL),
  ('vuthibich@thaco.com.vn',      'mkt_cty', NULL, NULL),
  ('giangthithuy@thaco.com.vn',   'mkt_cty', NULL, NULL),
  ('tranmanhthu@thaco.com.vn',    'mkt_cty', NULL, NULL),
  -- gd_brand chỉ phụ trách DVPT (đã bỏ) → cấp công ty xem
  ('dothanhson@thaco.com.vn',     'mkt_cty', NULL, NULL),
  ('nguyenvantu@thaco.com.vn',    'mkt_cty', NULL, NULL),
  -- mkt_showroom không gắn showroom → cấp công ty xem
  ('duongtrungtri@thaco.com.vn',  'mkt_cty', NULL, NULL),
  ('kinhdoanhxebus@thaco.com.vn', 'mkt_cty', NULL, NULL),
  ('ngonhatvu@thaco.com.vn',      'mkt_cty', NULL, NULL),
  ('thacobus@thaco.com.vn',       'mkt_cty', NULL, NULL),
  -- Giám đốc thương hiệu (brand đầu tiên hợp lệ)
  ('dinhvanchieu@thaco.com.vn',   'gd_brand', 'BMW',        NULL),
  ('nguyenxuanha@thaco.com.vn',   'gd_brand', 'STELLANTIS', NULL),
  ('trandinhbach@thaco.com.vn',   'gd_brand', 'Tải Bus',    NULL),
  ('truongthanhtuan@thaco.com.vn','gd_brand', 'KIA',        NULL),
  ('vuvanchinh@thaco.com.vn',     'gd_brand', 'Mazda',      NULL),
  -- Marketing thương hiệu
  ('buithidung@thaco.com.vn',     'mkt_brand', 'BMW',        NULL),
  ('daothithuhuyen@thaco.com.vn', 'mkt_brand', 'KIA',        NULL),
  ('dothiquynhanh@thaco.com.vn',  'mkt_brand', 'MINI',       NULL),
  ('luongthibichngoc@thaco.com.vn','mkt_brand','Tải Bus',    NULL),
  ('nguyenducgiang@thaco.com.vn', 'mkt_brand', 'BMW',        NULL),
  ('nguyenhoaianh@thaco.com.vn',  'mkt_brand', 'KIA',        NULL),
  ('nguyenhuonggiang@thaco.com.vn','mkt_brand','STELLANTIS', NULL),
  ('nguyenthithanhmai@thaco.com.vn','mkt_brand','KIA',       NULL),
  ('nguyenxuanngoc@thaco.com.vn', 'mkt_brand', 'Tải Bus',    NULL),
  -- Giám đốc showroom (showroom đầu tiên)
  ('dominhduc@thaco.com.vn',      'gd_showroom', NULL, 'TKC'),
  ('hoangvanquy@thaco.com.vn',    'gd_showroom', NULL, 'CM'),
  ('nguyenhongquang@thaco.com.vn','gd_showroom', NULL, 'LVL'),
  ('nguyenhuuhuynh@thaco.com.vn', 'gd_showroom', NULL, 'HN'),
  ('vuvanchuan@thaco.com.vn',     'gd_showroom', NULL, 'NVC'),
  -- Marketing showroom
  ('doanhainam@thaco.com.vn',     'mkt_showroom', NULL, 'BMWLB'),
  ('dokhuongduy@thaco.com.vn',    'mkt_showroom', NULL, 'TKC'),
  ('duongthikhanhlinh@thaco.com.vn','mkt_showroom',NULL,'DT'),
  ('letranquanganh@thaco.com.vn', 'mkt_showroom', NULL, 'LVL'),
  ('nguyenhuukhanh@thaco.com.vn', 'mkt_showroom', NULL, 'DAITU'),
  ('nguyenthihuonggiang@thaco.com.vn','mkt_showroom',NULL,'GP'),
  ('nguyenvantinh@thaco.com.vn',  'mkt_showroom', NULL, 'CM'),
  ('phamhonghai@thaco.com.vn',    'mkt_showroom', NULL, 'PVD'),
  ('tathithanhhien@thaco.com.vn', 'mkt_showroom', NULL, 'HN'),
  ('thanducdang@thaco.com.vn',    'mkt_showroom', NULL, 'BMWLD')
)
INSERT INTO crm_thacoauto.users (id, email, full_name, role, company_id, brand_id, showroom_id, is_active)
SELECT
  au.id,
  src.email,
  COALESCE(NULLIF(bu.full_name, ''), src.email),
  src.crm_role,
  'ec6b9c22-1317-4884-a496-cf0793d6c7b8'::uuid,
  b.id,
  s.id,
  true
FROM src
JOIN auth.users au ON lower(au.email) = src.email
LEFT JOIN mkt_budget.users bu ON bu.id = au.id
LEFT JOIN crm_thacoauto.brands b ON b.name = src.brand_name
LEFT JOIN crm_thacoauto.showrooms s
  ON s.code = src.sr_code AND s.company_id = 'ec6b9c22-1317-4884-a496-cf0793d6c7b8'::uuid
WHERE NOT EXISTS (SELECT 1 FROM crm_thacoauto.users cu WHERE cu.id = au.id);
