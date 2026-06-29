-- 0035_b10_reconciliation.sql
-- Đối soát kết quả B10: cờ bật theo công ty + 2 cột song song trên leads + ánh xạ cột import.
set search_path to crm_thacoauto, public;

-- Công tắc tính năng theo công ty (mặc định tắt).
alter table crm_thacoauto.companies
  add column if not exists b10_enabled boolean not null default false;

-- Ánh xạ cột file Excel đã lưu cho công ty: { "phone_col": "...", "status_col": "..." }.
alter table crm_thacoauto.companies
  add column if not exists b10_mapping jsonb;

-- Kết quả chăm sóc trên B10 (cùng tập mã với leads.status), NULL = B10 chưa phân loại.
alter table crm_thacoauto.leads
  add column if not exists b10_status text
  check (b10_status is null or b10_status in ('KHQT','GDTD','KHĐ','Chưa LH được','Fail'));

-- Lần gần nhất khớp khách này trong file B10. Có giá trị = "đã lên B10".
alter table crm_thacoauto.leads
  add column if not exists b10_synced_at timestamptz;

-- Bật cho công ty Thaco Auto Hà Nội.
update crm_thacoauto.companies set b10_enabled = true where slug = 'thaco-auto-hanoi';

notify pgrst, 'reload schema';
