-- 0036_channel_showroom_distribution.sql
-- Phân bổ CẤP 1 (kênh → showroom) chuyển từ cấu hình GLOBAL (companies.showroom_assign_strategy +
-- showrooms.assign_share_pct) sang cấu hình THEO TỪNG KÊNH. Lý do: 1 showroom phục vụ nhiều thương hiệu,
-- nếu % gắn ở showroom thì mọi thương hiệu đi qua showroom đó dùng chung 1 tỷ lệ → xung đột.
-- Sau migration: mỗi kênh có kiểu chia riêng (channel_accounts.showroom_assign_strategy) và % riêng cho
-- từng showroom (channel_account_showrooms.share_pct). Cấp 2/3 (showroom→phòng, phòng→TVBH) giữ nguyên.
-- Idempotent.

SET search_path TO crm_thacoauto, public;

-- 1) Kiểu chia cấp 1 theo kênh: least_loaded (chia đều) | round_robin (xoay vòng) | weighted (theo %)
ALTER TABLE crm_thacoauto.channel_accounts
  ADD COLUMN IF NOT EXISTS showroom_assign_strategy text NOT NULL DEFAULT 'least_loaded';

-- 2) % phân bổ của từng showroom TRONG kênh (chỉ dùng khi strategy = weighted)
ALTER TABLE crm_thacoauto.channel_account_showrooms
  ADD COLUMN IF NOT EXISTS share_pct numeric NOT NULL DEFAULT 0;

-- 3) Di trú hành vi cũ: nếu công ty đang chia theo tỷ lệ / xoay vòng, set kiểu chia đó cho các kênh
--    của công ty (resolve qua anchor showroom_id → showrooms.company_id → companies).
UPDATE crm_thacoauto.channel_accounts ca
SET showroom_assign_strategy = co.showroom_assign_strategy
FROM crm_thacoauto.showrooms s
JOIN crm_thacoauto.companies co ON co.id = s.company_id
WHERE ca.showroom_id = s.id
  AND co.showroom_assign_strategy IN ('round_robin', 'weighted')
  AND ca.showroom_assign_strategy = 'least_loaded';

-- 4) Di trú % cũ: mang showrooms.assign_share_pct (>0) vào junction để không mất cấu hình đang chạy.
UPDATE crm_thacoauto.channel_account_showrooms cas
SET share_pct = s.assign_share_pct
FROM crm_thacoauto.showrooms s
WHERE cas.showroom_id = s.id
  AND COALESCE(s.assign_share_pct, 0) > 0
  AND cas.share_pct = 0;

COMMENT ON COLUMN crm_thacoauto.channel_accounts.showroom_assign_strategy IS
  'Cách kênh này chia lead vào các showroom: least_loaded | round_robin | weighted.';
COMMENT ON COLUMN crm_thacoauto.channel_account_showrooms.share_pct IS
  'Tỷ lệ % showroom này nhận lead của kênh (chỉ dùng khi showroom_assign_strategy = weighted).';

-- PostgREST nạp lại schema cache để thấy cột mới.
NOTIFY pgrst, 'reload schema';
