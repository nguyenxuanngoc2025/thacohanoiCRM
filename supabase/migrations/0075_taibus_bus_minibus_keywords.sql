-- 0075: Nạp từ khoá dò dòng xe cho Bus + Mini Bus (bổ sung danh sách user 2026-07-23)
-- + thêm mã đầu kéo mới FV400. Brand Tải Bus = e2f64d29-d337-411d-a8be-f745816c1d99.
-- Lưu ý cơ chế: tên nhóm "Bus" -> key "bus" nằm trong "minibus" -> "mini bus" trơn sẽ nhập
--   nhằng (an toàn: không đoán). Mini Bus nhận qua "iveco/daily" (đặc trưng, không dính "bus").
BEGIN;

-- Bus: Thaco Cruizer, mã TB (ghế/giường), O 500 RS
UPDATE crm_thacoauto.models SET keywords = ARRAY[
  'thaco cruizer','cruizer','bus ghế','bus giường',
  'tb81','tb87','tb91','tb95','tb110','tb120','tb140','o 500 rs'
]::text[]
WHERE brand_id = 'e2f64d29-d337-411d-a8be-f745816c1d99' AND name = 'Bus';

-- Mini Bus: IVECO Daily
UPDATE crm_thacoauto.models SET keywords = ARRAY[
  'iveco','iveco daily','daily'
]::text[]
WHERE brand_id = 'e2f64d29-d337-411d-a8be-f745816c1d99' AND name = 'Mini Bus';

-- Đầu kéo - Tải nặng - Ben nặng: thêm FV400 (đầu kéo 6x4)
UPDATE crm_thacoauto.models SET keywords = ARRAY[
  'sinotruk','auman est','auman etx','auman gtl','auman c300','auman c340',
  'smrm','đầu kéo','rơ moóc','fv400'
]::text[]
WHERE brand_id = 'e2f64d29-d337-411d-a8be-f745816c1d99' AND name = 'Đầu kéo - Tải nặng - Ben nặng';

COMMIT;
