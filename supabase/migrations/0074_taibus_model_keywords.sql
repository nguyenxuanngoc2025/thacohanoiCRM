-- 0074: Nạp từ khoá dò dòng xe cho nhóm Tải Bus (5 nhóm xe tải)
-- Mục tiêu: dò đúng dòng xe từ nội dung lead. Luật user chốt 2026-07-23:
--   - Towner có "V.." -> Tải Van ; có "T.." -> Tải nhẹ máy xăng ; "Towner" trơn -> KHÔNG đoán (an toàn)
--   - Auman/các tên khác: chỉ gán khi khớp đúng 1 dòng (thận trọng)
-- Cơ chế detectModel (src/lib/detect-model.ts): normalize bỏ dấu + bỏ ký tự không [a-z0-9];
--   keyHit chỉ chặn ranh giới SỐ (cx3 không dính trong cx30). Ranh giới chữ KHÔNG chặn ->
--   dùng "towner v"/"towner t" để phân biệt Van/Tải mà không nhầm chéo.
-- Brand Tải Bus = e2f64d29-d337-411d-a8be-f745816c1d99. KHÔNG đụng Bus/Mini Bus (chưa có dữ liệu).
BEGIN;

-- Tải Van: "towner v" bắt mọi biến thể có chữ V (Towner Van, V2.x-2S/5S, V5, V7) + VAN điện
UPDATE crm_thacoauto.models SET keywords = ARRAY[
  'thacohanoi van','lăn bánh van','lái thử van','đăng ký van','thử van',
  'towner v','van điện'
]::text[]
WHERE brand_id = 'e2f64d29-d337-411d-a8be-f745816c1d99' AND name = 'Tải Van';

-- Tải nhẹ máy xăng: BỎ "towner" trơn + "thaco towner" (nhập nhằng Van/Tải);
-- thêm "towner t" để bắt Towner Tải (T2.3/T2.5/T2.8). TF codes giữ nguyên.
UPDATE crm_thacoauto.models SET keywords = ARRAY[
  'towner800','lăn bánh tf','tf230','thacohanoi tf230','thông tin tf','tf220230',
  'towner990','lái thử tf','tf220','thacohanoi tf220','towner t','towner tải'
]::text[]
WHERE brand_id = 'e2f64d29-d337-411d-a8be-f745816c1d99' AND name = 'Tải nhẹ máy xăng';

-- Tải nhẹ máy dầu: Kia Frontier (K200/K250/K250L/K200S/K200SD .E5)
UPDATE crm_thacoauto.models SET keywords = ARRAY[
  'thacohanoi kia','k250l','k200','k200l','lăn bánh kia','k250','lái thử kia',
  'frontier','kia frontier','k200s','k200sd'
]::text[]
WHERE brand_id = 'e2f64d29-d337-411d-a8be-f745816c1d99' AND name = 'Tải nhẹ máy dầu';

-- Tải trung - Ben trung: Canter, Linker, Fuso, Auman C240/C160, Forland
UPDATE crm_thacoauto.models SET keywords = ARRAY[
  'linker','canter','fuso','forland','auman c240','auman c160','tf2800',
  'tf4.9','tf7.5','tf8.5','fa140','fi170','fj285','fd120','fd490','fd600','fd700','fd150'
]::text[]
WHERE brand_id = 'e2f64d29-d337-411d-a8be-f745816c1d99' AND name = 'Tải trung - Ben trung';

-- Đầu kéo - Tải nặng - Ben nặng: Sinotruk, Auman EST/ETX/GTL/C300/C340, SMRM (rơ moóc)
UPDATE crm_thacoauto.models SET keywords = ARRAY[
  'sinotruk','auman est','auman etx','auman gtl','auman c300','auman c340',
  'smrm','đầu kéo','rơ moóc'
]::text[]
WHERE brand_id = 'e2f64d29-d337-411d-a8be-f745816c1d99' AND name = 'Đầu kéo - Tải nặng - Ben nặng';

COMMIT;
