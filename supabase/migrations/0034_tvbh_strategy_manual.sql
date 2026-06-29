-- 0034: Thêm kiểu chia 'manual' (Thủ công) cho cấp phòng → TVBH.
-- Trưởng phòng muốn tự chia tay từng lead thay vì hệ thống tự gán. Khi chọn 'manual',
-- pickByStrategy trả null → lead vẫn về phòng (sales_team_id) nhưng assigned_to = NULL.
-- CHỈ nới chk_tvbh_strategy (cấp 3). Cấp công ty→showroom và showroom→phòng giữ nguyên 3 kiểu.
SET search_path TO crm_thacoauto, public;

ALTER TABLE crm_thacoauto.sales_teams DROP CONSTRAINT IF EXISTS chk_tvbh_strategy;
ALTER TABLE crm_thacoauto.sales_teams ADD CONSTRAINT chk_tvbh_strategy
  CHECK (tvbh_assign_strategy = ANY (ARRAY['least_loaded','round_robin','weighted','manual']));

NOTIFY pgrst, 'reload schema';
