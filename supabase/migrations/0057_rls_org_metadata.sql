-- 0057: Bật RLS cô lập tenant cho 4 bảng "metadata tổ chức" đọc qua RLS client.
--
-- VẤN ĐỀ (rò chéo tenant, mức TRUNG BÌNH): showrooms / sales_teams /
-- notification_channels / channel_accounts trước đây RLS OFF (cố ý: chỉ service_role
-- ghi). Nhưng trang dashboard (/leads, /assign) đọc showrooms + sales_teams qua RLS
-- client (createClient) KHÔNG kèm .eq(company_id) → dropdown lọc Showroom/Phòng hiện
-- TÊN của MỌI công ty. Không lộ data lead (bảng leads có RLS) nhưng lộ cấu trúc tổ chức
-- của tenant khác. App chạy đa công ty dài hạn → phải vá tận gốc bằng RLS, không dựa
-- vào từng câu query nhớ .eq(company_id).
--
-- GIẢI PHÁP: bật RLS + policy SELECT theo công ty. CHỈ SELECT — mọi INSERT/UPDATE/DELETE
-- vẫn đi qua service_role (bypass RLS) như thiết kế cũ (đã kiểm: 100% route ghi 4 bảng
-- này dùng createServiceClient). platform_owner + cron dùng service_role → KHÔNG ảnh hưởng.
--
-- Idempotent.

SET search_path TO crm_thacoauto, public;

-- 1) showrooms — có company_id NOT NULL → scope trực tiếp
ALTER TABLE crm_thacoauto.showrooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS showrooms_select ON crm_thacoauto.showrooms;
CREATE POLICY showrooms_select ON crm_thacoauto.showrooms FOR SELECT
USING (company_id = crm_thacoauto.get_my_company_id());

-- 2) sales_teams — có company_id NOT NULL → scope trực tiếp
ALTER TABLE crm_thacoauto.sales_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_teams_select ON crm_thacoauto.sales_teams;
CREATE POLICY sales_teams_select ON crm_thacoauto.sales_teams FOR SELECT
USING (company_id = crm_thacoauto.get_my_company_id());

-- 3) notification_channels — có company_id NOT NULL → scope trực tiếp
ALTER TABLE crm_thacoauto.notification_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_channels_select ON crm_thacoauto.notification_channels;
CREATE POLICY notification_channels_select ON crm_thacoauto.notification_channels FOR SELECT
USING (company_id = crm_thacoauto.get_my_company_id());

-- 4) channel_accounts — KHÔNG có company_id, chỉ showroom_id NOT NULL → scope qua showroom
ALTER TABLE crm_thacoauto.channel_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_accounts_select ON crm_thacoauto.channel_accounts;
CREATE POLICY channel_accounts_select ON crm_thacoauto.channel_accounts FOR SELECT
USING (
  showroom_id IN (
    SELECT id FROM crm_thacoauto.showrooms
    WHERE company_id = crm_thacoauto.get_my_company_id()
  )
);
