-- 0040_lead_name_enrich.sql
-- Tra tên Zalo tự động cho lead tên trống/bất thường (quét 2 lần/ngày, độc lập luồng thông báo).
--   name_locked      = user đã tự sửa tên → auto KHÔNG bao giờ ghi đè.
--   name_enriched_at = mốc bot đã THỬ tra Zalo (thành công hoặc SĐT không có Zalo) → chỉ thử 1 lần,
--                      tránh tra lặp vô hạn cùng 1 lead hopeless. Lead mới = NULL → được quét.
alter table crm_thacoauto.leads
  add column if not exists name_locked boolean not null default false,
  add column if not exists name_enriched_at timestamptz;
