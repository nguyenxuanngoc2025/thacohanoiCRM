-- 0047: Kênh thông báo (scope='sales') nhận NHIỀU phòng thay vì 1.
-- Lý do: nhiều phòng của 1 showroom muốn gửi lead/báo cáo về CÙNG 1 nhóm Zalo,
-- tiêu đề phân biệt theo tên phòng. Cột sales_team_id cũ giữ lại (= phần tử đầu)
-- để không phá dữ liệu / test cũ; định tuyến nay dùng sales_team_ids.
-- Idempotent.

SET search_path TO crm_thacoauto, public;

ALTER TABLE crm_thacoauto.notification_channels
  ADD COLUMN IF NOT EXISTS sales_team_ids uuid[] NOT NULL DEFAULT '{}';

-- Backfill: kênh đang gắn 1 phòng → mảng 1 phần tử.
UPDATE crm_thacoauto.notification_channels
  SET sales_team_ids = ARRAY[sales_team_id]
  WHERE sales_team_id IS NOT NULL AND cardinality(sales_team_ids) = 0;

NOTIFY pgrst, 'reload schema';
