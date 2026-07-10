-- 0039_realtime_leads.sql
-- Bật Realtime cho bảng leads để trang danh sách tự cập nhật khi có lead mới (bỏ F5).
-- Chỉ cần phát tín hiệu "có thay đổi" → REPLICA IDENTITY mặc định (khoá chính) là đủ.
-- RLS vẫn gác: Realtime chỉ đẩy thay đổi của dòng mà user được SELECT.
alter publication supabase_realtime add table crm_thacoauto.leads;
