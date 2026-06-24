-- 0014: Phân loại chặt chẽ hơn
--   fail_reason     : lý do khi phân loại Fail (bắt buộc chọn khi Fail)
--   no_answer_count : số lần gọi nhưng chưa liên hệ được (tăng mỗi lần chọn 'Chưa LH được')
ALTER TABLE crm_thacoauto.leads
  ADD COLUMN IF NOT EXISTS fail_reason     text,
  ADD COLUMN IF NOT EXISTS no_answer_count integer NOT NULL DEFAULT 0;
