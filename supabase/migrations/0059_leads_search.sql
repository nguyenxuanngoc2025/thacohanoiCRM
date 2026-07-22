-- 0059: Phân trang phía server trang /leads.
-- PHẦN 1: cột tìm kiếm không dấu + index. PHẦN 2 (task 3): RPC leads_search_page.
-- Idempotent.
SET search_path TO crm_thacoauto, public;

-- Bỏ dấu tiếng Việt + tìm chuỗi con nhanh.
-- Do search_path đặt crm_thacoauto trước, hai extension này được cài vào schema
-- crm_thacoauto (KHÔNG phải public) → tham chiếu crm_thacoauto.unaccent bên dưới.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Cột tìm kiếm: tên bỏ dấu + chữ thường, nối số điện thoại (chỉ chữ số).
-- unaccent KHÔNG immutable → không dùng generated column; duy trì bằng trigger.
ALTER TABLE crm_thacoauto.leads ADD COLUMN IF NOT EXISTS search_text text;

CREATE OR REPLACE FUNCTION crm_thacoauto.leads_search_text(p_name text, p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(crm_thacoauto.unaccent(coalesce(p_name, ''))) || ' ' || regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
$$;

CREATE OR REPLACE FUNCTION crm_thacoauto.leads_search_text_trg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_text := crm_thacoauto.leads_search_text(NEW.full_name, NEW.phone);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_search_text_biu ON crm_thacoauto.leads;
CREATE TRIGGER leads_search_text_biu
  BEFORE INSERT OR UPDATE OF full_name, phone ON crm_thacoauto.leads
  FOR EACH ROW EXECUTE FUNCTION crm_thacoauto.leads_search_text_trg();

-- Backfill lead hiện có.
UPDATE crm_thacoauto.leads
SET search_text = crm_thacoauto.leads_search_text(full_name, phone)
WHERE search_text IS NULL;

-- Index trigram cho ILIKE '%...%'.
CREATE INDEX IF NOT EXISTS idx_leads_search_text ON crm_thacoauto.leads USING gin (search_text gin_trgm_ops);
