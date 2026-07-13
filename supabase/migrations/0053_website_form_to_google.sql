-- 0053: Quy lead nguồn "Website form" cũ về Google → Form web (google_form_web).
-- Web form nay nằm trong Nguồn Google (kênh Form web).
SET search_path TO crm_thacoauto, public;

UPDATE crm_thacoauto.leads
  SET source = 'google_form_web'
  WHERE source = 'Website form';
