-- 0016: cột chống lặp nhắc quá hạn
ALTER TABLE crm_thacoauto.leads
  ADD COLUMN IF NOT EXISTS last_overdue_notified_at timestamptz;
