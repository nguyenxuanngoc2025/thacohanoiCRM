-- 0028: thêm cột last_sync cho channel_accounts (ghi nhận kết quả lần đồng bộ gần nhất).
-- Dùng cho nguồn Google Sheet: mỗi lần cron/đồng-bộ-tay quét sheet sẽ ghi
-- { at, rows, fresh, dup, errors } — rows=dòng có SĐT, fresh=lead mới thêm, dup=dòng trùng bị bỏ qua.
-- channel_accounts là master catalog (RLS OFF) — chỉ đọc/ghi bằng service_role phía server.
ALTER TABLE crm_thacoauto.channel_accounts
  ADD COLUMN IF NOT EXISTS last_sync jsonb;

COMMENT ON COLUMN crm_thacoauto.channel_accounts.last_sync IS
  'Kết quả lần đồng bộ gần nhất (Google Sheet): { at, rows, fresh, dup, errors }. NULL nếu chưa đồng bộ.';

-- PostgREST cần nạp lại schema cache để thấy cột mới.
NOTIFY pgrst, 'reload schema';
