-- 0038_b10_care_note.sql
-- Nội dung chăm sóc khách trên B10 (TVBH ghi trong file import) — lưu song song trên leads.
set search_path to crm_thacoauto, public;

-- Nội dung chăm sóc B10 (text tự do lấy từ cột tương ứng trong file đối soát).
alter table crm_thacoauto.leads
  add column if not exists b10_care_note text;

notify pgrst, 'reload schema';
