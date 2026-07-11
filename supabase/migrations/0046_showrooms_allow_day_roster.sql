-- Cho phép chiến lược 'day_roster' ở cấp showroom → phòng (lịch phòng trực theo ngày).
-- Constraint cũ chk_team_strategy chỉ nhận 3 giá trị → chặn khi lưu day_roster.
set search_path to crm_thacoauto, public;

ALTER TABLE crm_thacoauto.showrooms DROP CONSTRAINT IF EXISTS chk_team_strategy;
ALTER TABLE crm_thacoauto.showrooms ADD CONSTRAINT chk_team_strategy
  CHECK (team_assign_strategy = ANY (ARRAY['least_loaded','round_robin','weighted','day_roster']));

notify pgrst, 'reload schema';
