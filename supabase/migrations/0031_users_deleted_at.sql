-- Đánh dấu tài khoản đã XOÁ vĩnh viễn, tách khỏi "Tạm khoá" (is_active=false nhưng vẫn đăng nhập lại được sau khi mở khoá).
-- Giữ row để bảo toàn FK leads.assigned_to + nhật ký, nhưng ẩn khỏi danh sách tài khoản.
ALTER TABLE crm_thacoauto.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Backfill: tài khoản đã bị xoá trước đây (auth user không còn) → đánh dấu deleted_at.
-- Tài khoản "Tạm khoá" (is_active=false NHƯNG auth còn) KHÔNG bị động tới.
UPDATE crm_thacoauto.users u
SET deleted_at = now()
WHERE u.is_active = false
  AND u.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);

NOTIFY pgrst, 'reload schema';
