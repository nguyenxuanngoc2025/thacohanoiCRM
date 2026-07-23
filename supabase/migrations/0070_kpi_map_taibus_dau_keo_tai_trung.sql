-- 0070: bổ sung 2 ánh xạ dòng Tải Bus vào kpi_model_map (khớp thực hiện CRM vào khung Budget).
--
-- Lỗi phát hiện: Bảng quản trị đếm KHQT Tải Bus tháng 7 = 106, nhưng Báo cáo theo KPI chỉ 76.
-- Nguyên nhân: seed ánh xạ trước (0065) khớp theo lower(name) nên BỎ SÓT 2 dòng Tải Bus do
-- tên Budget vênh DẤU CÁCH so tên CRM:
--   Budget "Đầu kéo- Tải nặng- Ben nặng"  ≠ CRM "Đầu kéo - Tải nặng - Ben nặng"
--   Budget "Tải trung- Ben trung"          ≠ CRM "Tải trung - Ben trung"
-- → 2 dòng Budget này crm_model_id = NULL ⇒ lead CRM (KHQT) của 2 dòng KHÔNG gắn được vào khung
--   ⇒ rơi khỏi Báo cáo theo KPI (~20 KHQT). Vá bằng cách chèn đúng 2 ánh xạ (idempotent).
-- Sau vá: KPI actual_khqt Tải Bus 76 → 96 (khớp Bảng quản trị; phần chênh còn lại là lead ở
-- showroom×kênh mà Budget KHÔNG lập kế hoạch dòng đó — nằm NGOÀI khung, đúng thiết kế).
INSERT INTO crm_thacoauto.kpi_model_map (company_id, budget_brand_name, budget_model_name, crm_model_id, active)
SELECT 'ec6b9c22-1317-4884-a496-cf0793d6c7b8'::uuid, v.b, v.m, v.c::uuid, true
FROM (VALUES
  ('TẢI BUS','Đầu kéo- Tải nặng- Ben nặng','df6b838e-e98a-4a23-aa7b-f0302df09c3d'),
  ('TẢI BUS','Tải trung- Ben trung','c20b4f8c-58b0-4738-bf8c-44a6e67ccaec')
) AS v(b,m,c)
WHERE NOT EXISTS (
  SELECT 1 FROM crm_thacoauto.kpi_model_map k
  WHERE k.company_id = 'ec6b9c22-1317-4884-a496-cf0793d6c7b8'::uuid
    AND k.budget_brand_name = v.b AND k.budget_model_name = v.m
);
