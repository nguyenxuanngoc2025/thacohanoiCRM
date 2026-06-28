-- 0025: thêm cột secret cho channel_accounts (khoá bí mật OA Zalo để xác thực chữ ký webhook)
-- channel_accounts là master catalog (RLS OFF) — chỉ đọc bằng service_role phía server.
ALTER TABLE crm_thacoauto.channel_accounts
  ADD COLUMN IF NOT EXISTS secret text;

COMMENT ON COLUMN crm_thacoauto.channel_accounts.secret IS
  'Khoá bí mật của kênh (Zalo OA Secret Key) — dùng xác thực chữ ký webhook. NULL với Facebook.';

-- PostgREST cần nạp lại schema cache để thấy cột mới.
NOTIFY pgrst, 'reload schema';
