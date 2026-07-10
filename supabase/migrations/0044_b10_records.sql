-- 0044_b10_records.sql
-- Kho lưu trữ dữ liệu B10 (DDMS) theo từng công ty, độc lập với bảng leads.
-- Mỗi lần user up đối soát → upsert TOÀN BỘ dòng file vào đây (bản mới đè bản cũ theo SĐT).
-- Khi có lead mới trùng SĐT trong kho → đánh dấu "khách cũ đã có trên B10" (chỉ tham chiếu).
set search_path to crm_thacoauto, public;

CREATE TABLE IF NOT EXISTS crm_thacoauto.b10_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES crm_thacoauto.companies(id) ON DELETE CASCADE,
  -- SĐT chuẩn hoá +84… (cùng khoá định danh với leads.phone sau normalizePhone).
  phone         text NOT NULL,
  -- Trạng thái B10 tốt nhất suy từ file (cùng tập mã leads.status). NULL = chưa phân loại.
  b10_status    text CHECK (b10_status is null or b10_status in ('KHQT','GDTD','KHĐ','Chưa LH được','Fail')),
  -- Toàn bộ nội dung chăm sóc gộp từ file (nhiều dòng đàm phán, mỗi dòng 1 mục).
  care_note     text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_b10_records_company_phone
  ON crm_thacoauto.b10_records (company_id, phone);

ALTER TABLE crm_thacoauto.b10_records ENABLE ROW LEVEL SECURITY;

-- Thành viên công ty được đọc kho B10 của công ty mình; ghi chỉ qua service_role.
DROP POLICY IF EXISTS b10_records_select ON crm_thacoauto.b10_records;
CREATE POLICY b10_records_select ON crm_thacoauto.b10_records
  FOR SELECT USING (company_id = get_my_company_id());

-- Cấp quyền schema (gotcha #5): mở cổng, RLS vẫn gác từng dòng.
GRANT ALL ON crm_thacoauto.b10_records TO anon, authenticated, service_role;

notify pgrst, 'reload schema';
