-- 0045_showroom_day_roster.sql
-- Lịch trực phòng nhận lead theo NGÀY DƯƠNG LỊCH cho từng showroom.
-- Quản lý showroom đặt: ngày X → phòng Y nhận toàn bộ lead của showroom (theo hãng phòng bán).
-- Ngày không có dòng (hoặc sales_team_id NULL) = chưa đặt lịch → lead giữ chưa phân giao + nhắc Zalo.
-- Chỉ có tác dụng khi showrooms.team_assign_strategy = 'day_roster'.
set search_path to crm_thacoauto, public;

CREATE TABLE IF NOT EXISTS crm_thacoauto.showroom_day_roster (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES crm_thacoauto.companies(id) ON DELETE CASCADE,
  showroom_id   uuid NOT NULL REFERENCES crm_thacoauto.showrooms(id) ON DELETE CASCADE,
  roster_date   date NOT NULL,
  -- Phòng trực ngày đó. NULL = đã tạo dòng nhưng gỡ phòng (coi như chưa đặt lịch).
  sales_team_id uuid REFERENCES crm_thacoauto.sales_teams(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (showroom_id, roster_date)
);

CREATE INDEX IF NOT EXISTS idx_sdr_showroom_date
  ON crm_thacoauto.showroom_day_roster (showroom_id, roster_date);

ALTER TABLE crm_thacoauto.showroom_day_roster ENABLE ROW LEVEL SECURITY;

-- Thành viên công ty đọc lịch của công ty mình; ghi qua service_role (route admin).
DROP POLICY IF EXISTS sdr_select ON crm_thacoauto.showroom_day_roster;
CREATE POLICY sdr_select ON crm_thacoauto.showroom_day_roster
  FOR SELECT USING (company_id = get_my_company_id());

-- Cấp quyền schema (gotcha #5): mở cổng, RLS vẫn gác từng dòng.
GRANT ALL ON crm_thacoauto.showroom_day_roster TO anon, authenticated, service_role;

notify pgrst, 'reload schema';
