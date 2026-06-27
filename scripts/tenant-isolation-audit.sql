-- ============================================================================
-- AUDIT TÁCH BIỆT CÔNG TY (multi-tenant isolation) — READ ONLY
-- Schema: crm_thacoauto. Chạy:
--   ssh root@145.79.8.92 'docker exec -i supabase-db psql -U supabase_admin -d postgres -P pager=off' < scripts/tenant-isolation-audit.sql
-- Mục tiêu: chứng minh dữ liệu mỗi công ty phân vùng SẠCH, không có dòng lẫn công ty.
-- Mọi truy vấn CHỈ đọc (SELECT). Phần "RÒ RỈ" PHẢI ra 0 dòng thì hệ thống mới đạt.
-- Ghi chú: channel_accounts KHÔNG có company_id — gắn công ty gián tiếp qua showroom_id.
-- ============================================================================
SET search_path TO crm_thacoauto;

\echo ''
\echo '======== 1. SỐ DÒNG MỖI CÔNG TY (mỗi bảng phải phân vùng theo company_id) ========'
SELECT c.name AS cong_ty,
  (SELECT count(*) FROM showrooms             x WHERE x.company_id=c.id) AS showrooms,
  (SELECT count(*) FROM sales_teams           x WHERE x.company_id=c.id) AS phong,
  (SELECT count(*) FROM users                 x WHERE x.company_id=c.id) AS users,
  (SELECT count(*) FROM leads                 x WHERE x.company_id=c.id) AS leads,
  (SELECT count(*) FROM channel_accounts      x JOIN showrooms s ON s.id=x.showroom_id WHERE s.company_id=c.id) AS kenh,
  (SELECT count(*) FROM assignment_rules      x WHERE x.company_id=c.id) AS rules,
  (SELECT count(*) FROM sla_config            x WHERE x.company_id=c.id) AS sla,
  (SELECT count(*) FROM notification_channels x WHERE x.company_id=c.id) AS notif
FROM companies c ORDER BY c.name;

\echo ''
\echo '======== 2. KIỂM TRA RÒ RỈ CHÉO — mỗi truy vấn PHẢI ra 0 dòng ========'

\echo '-- 2a. Phòng (sales_teams) có showroom thuộc công ty KHÁC với company_id của phòng:'
SELECT st.id AS sales_team_id, st.company_id AS team_company, s.company_id AS showroom_company
FROM sales_teams st JOIN showrooms s ON s.id=st.showroom_id
WHERE st.company_id IS DISTINCT FROM s.company_id;

\echo '-- 2b. Lead có showroom thuộc công ty KHÁC với company_id của lead:'
SELECT l.id AS lead_id, l.company_id AS lead_company, s.company_id AS showroom_company
FROM leads l JOIN showrooms s ON s.id=l.showroom_id
WHERE l.company_id IS DISTINCT FROM s.company_id;

\echo '-- 2c. Lead có phòng (sales_team) thuộc công ty KHÁC:'
SELECT l.id AS lead_id, l.company_id AS lead_company, st.company_id AS team_company
FROM leads l JOIN sales_teams st ON st.id=l.sales_team_id
WHERE l.company_id IS DISTINCT FROM st.company_id;

\echo '-- 2d. Lead giao cho TVBH (assigned_to) thuộc công ty KHÁC:'
SELECT l.id AS lead_id, l.company_id AS lead_company, u.company_id AS tvbh_company
FROM leads l JOIN users u ON u.id=l.assigned_to
WHERE l.company_id IS DISTINCT FROM u.company_id;

\echo '-- 2e. User gắn vào phòng (sales_team) thuộc công ty KHÁC:'
SELECT u.id AS user_id, u.company_id AS user_company, st.company_id AS team_company
FROM users u JOIN sales_teams st ON st.id=u.sales_team_id
WHERE u.company_id IS DISTINCT FROM st.company_id;

\echo '-- 2f. Lead có kênh (channel) mà showroom-gốc của kênh thuộc công ty KHÁC:'
SELECT l.id AS lead_id, l.company_id AS lead_company, s.company_id AS channel_showroom_company
FROM leads l JOIN channel_accounts ca ON ca.id=l.channel_account_id
JOIN showrooms s ON s.id=ca.showroom_id
WHERE l.company_id IS DISTINCT FROM s.company_id;

\echo '-- 2g. Junction kênh↔showroom: showroom-gốc của kênh và showroom liên kết khác công ty:'
SELECT cas.channel_account_id, sa.company_id AS anchor_company, sj.company_id AS linked_company
FROM channel_account_showrooms cas
JOIN channel_accounts ca ON ca.id=cas.channel_account_id
JOIN showrooms sa ON sa.id=ca.showroom_id
JOIN showrooms sj ON sj.id=cas.showroom_id
WHERE sa.company_id IS DISTINCT FROM sj.company_id;

\echo '-- 2h. Rule phân giao: showroom_id (nếu có) thuộc công ty KHÁC với company_id của rule:'
SELECT ar.id AS rule_id, ar.company_id AS rule_company, s.company_id AS showroom_company
FROM assignment_rules ar JOIN showrooms s ON s.id=ar.showroom_id
WHERE ar.company_id IS DISTINCT FROM s.company_id;

\echo '-- 2i. Rule ghim TVBH (specific_user_id) thuộc công ty KHÁC:'
SELECT ar.id AS rule_id, ar.company_id AS rule_company, u.company_id AS user_company
FROM assignment_rules ar JOIN users u ON u.id=ar.specific_user_id
WHERE ar.company_id IS DISTINCT FROM u.company_id;

\echo '-- 2j. Kênh thông báo (notification_channels) trỏ showroom thuộc công ty KHÁC:'
SELECT nc.id AS notif_id, nc.company_id AS notif_company, s.company_id AS showroom_company
FROM notification_channels nc JOIN showrooms s ON s.id=nc.showroom_id
WHERE nc.company_id IS DISTINCT FROM s.company_id;

\echo ''
\echo '======== 3. KẾT LUẬN ========'
\echo 'Phần 1 hiển thị số dòng riêng từng công ty. Phần 2 (2a–2j) PHẢI trống (0 dòng).'
\echo 'Mọi mục 2x đều 0 dòng → dữ liệu tách biệt sạch giữa các công ty.'
