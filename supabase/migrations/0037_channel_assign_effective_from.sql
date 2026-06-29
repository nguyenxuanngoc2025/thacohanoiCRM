-- 0037_channel_assign_effective_from.sql
-- Mốc hiệu lực phân bổ CẤP 1 theo từng kênh. Khi admin đổi cách chia / tỷ lệ % / danh sách showroom
-- của 1 kênh, mốc này được đặt lại = thời điểm lưu. Lúc chia lead mới, hệ thống CHỈ đếm lead phát sinh
-- SAU mốc này (cho cả weighted, least_loaded, round_robin) → lead cũ không kéo lệch cân bằng,
-- "hiệu lực kể từ thời điểm thay đổi". NULL = chưa từng cấu hình lại → đếm toàn thời gian (tương thích cũ).
-- Idempotent.

SET search_path TO crm_thacoauto, public;

ALTER TABLE crm_thacoauto.channel_accounts
  ADD COLUMN IF NOT EXISTS assign_effective_from timestamptz;

COMMENT ON COLUMN crm_thacoauto.channel_accounts.assign_effective_from IS
  'Mốc hiệu lực phân bổ cấp 1: chỉ đếm lead created_at >= mốc này khi chia. Đặt lại mỗi lần đổi cách chia/tỷ lệ/showroom. NULL = đếm toàn thời gian.';

NOTIFY pgrst, 'reload schema';
