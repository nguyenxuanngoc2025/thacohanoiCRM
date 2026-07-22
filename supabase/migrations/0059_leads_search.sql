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

-- Chuẩn hoá SĐT về dạng nội địa (0…): bỏ ký tự không phải số, mã quốc gia 84… → 0….
-- SĐT lưu dạng +84… nên digits ra 84…; người dùng gõ 4 số đầu kiểu 0… phải khớp được.
CREATE OR REPLACE FUNCTION crm_thacoauto.phone_national(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') LIKE '84%'
      THEN '0' || substring(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') FROM 3)
    ELSE regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
  END
$$;

CREATE OR REPLACE FUNCTION crm_thacoauto.leads_search_text(p_name text, p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(crm_thacoauto.unaccent(coalesce(p_name, ''))) || ' ' || crm_thacoauto.phone_national(p_phone)
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

-- Backfill lead hiện có (recompute khi công thức đổi → idempotent, chỉ ghi dòng lệch).
UPDATE crm_thacoauto.leads
SET search_text = crm_thacoauto.leads_search_text(full_name, phone)
WHERE search_text IS DISTINCT FROM crm_thacoauto.leads_search_text(full_name, phone);

-- Index trigram cho ILIKE '%...%'.
CREATE INDEX IF NOT EXISTS idx_leads_search_text ON crm_thacoauto.leads USING gin (search_text gin_trgm_ops);

-- ── PHẦN 2: RPC phân trang + thống kê ─────────────────────────────────────────
-- SECURITY INVOKER (mặc định) → SELECT trên leads chịu policy leads_select (scope theo role).
-- Chỉ nhận thêm cấu hình cấp công ty (hãng mở / showroom tắt) làm tham số lọc.
CREATE OR REPLACE FUNCTION crm_thacoauto.leads_search_page(
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_showroom uuid DEFAULT NULL, p_brand uuid DEFAULT NULL, p_model uuid DEFAULT NULL,
  p_sources text[] DEFAULT NULL, p_assignee uuid DEFAULT NULL, p_assignee_none boolean DEFAULT false,
  p_status text DEFAULT NULL, p_status_none boolean DEFAULT false, p_team uuid DEFAULT NULL,
  p_tab text DEFAULT 'all', p_q_digits text DEFAULT '', p_q_text text DEFAULT NULL,
  p_open_brands uuid[] DEFAULT NULL, p_inactive_showrooms uuid[] DEFAULT NULL,
  p_sort text DEFAULT 'time', p_dir text DEFAULT 'desc',
  p_limit int DEFAULT 50, p_offset int DEFAULT 0, p_b10 boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path TO 'crm_thacoauto','public','pg_catalog'
AS $$
DECLARE
  v_order text;
  v_dir text := CASE WHEN lower(p_dir) = 'asc' THEN 'ASC' ELSE 'DESC' END;
  v_result jsonb;
BEGIN
  -- Allowlist cột sắp xếp → chống SQL injection (dùng dynamic SQL bên dưới).
  v_order := CASE p_sort
    WHEN 'name' THEN 'l.full_name' WHEN 'phone' THEN 'l.phone'
    WHEN 'showroom' THEN 'sr.name' WHEN 'team' THEN 'st.name'
    WHEN 'brand' THEN 'b.name' WHEN 'model' THEN 'm.name'
    WHEN 'assignee' THEN 'u.full_name' WHEN 'class' THEN 'l.status'
    ELSE 'l.created_at' END;

  -- Hàm STABLE KHÔNG cho phép thao tác volatile (CREATE TABLE AS / CREATE VIEW / DROP VIEW).
  -- Vì vậy gộp tất cả vào MỘT truy vấn động thuần SELECT dùng các CTE:
  --   base   = lead khớp bộ lọc (chưa tab)          → tính stats.
  --   tabbed = base + điều kiện tab                  → tính total_count + rows.
  -- Tham số hoá qua USING ($1..$n) — an toàn injection cho MỌI giá trị.
  -- Chỉ ORDER BY (v_order/v_dir) là nội suy %s, nhưng lấy từ ALLOWLIST cố định ở trên.
  -- SELECT trên crm_thacoauto.leads vẫn chịu RLS leads_select (hàm SECURITY INVOKER).
  EXECUTE format($q$
    WITH base AS (
      SELECT l.* FROM crm_thacoauto.leads l
      WHERE ($1 IS NULL OR l.created_at >= $1)
        AND ($2 IS NULL OR l.created_at <= $2)
        AND ($3 IS NULL OR l.showroom_id = $3)
        AND ($4 IS NULL OR l.brand_id = $4)
        AND ($5 IS NULL OR l.model_id = $5)
        AND ($6 IS NULL OR l.sales_team_id = $6)
        AND ($7 IS NULL OR l.source = ANY($7))
        AND (NOT $8 OR l.assigned_to IS NULL)
        AND ($9 IS NULL OR l.assigned_to = $9)
        AND (NOT $10 OR l.status IS NULL)
        AND ($11 IS NULL OR l.status = $11)
        AND ($12 IS NULL OR array_length($12,1) IS NULL OR l.brand_id = ANY($12))
        AND ($13 IS NULL OR l.showroom_id IS NULL OR NOT (l.showroom_id = ANY($13)))
        AND (
          (coalesce($14,'') = '' AND $15 IS NULL)
          OR ($14 <> '' AND (
                crm_thacoauto.phone_national(l.phone) LIKE $14 || '%%'
             OR (length($14) >= 3 AND crm_thacoauto.phone_national(l.phone) LIKE '%%' || $14)
             OR (length($14) >= 4 AND crm_thacoauto.phone_national(l.phone) LIKE '%%' || $14 || '%%')
          ))
          OR ($15 IS NOT NULL AND l.search_text ILIKE '%%' || $15 || '%%')
        )
    ),
    tabbed AS (
      SELECT * FROM base l
      WHERE CASE $16
        WHEN 'pending'   THEN l.last_contact_at IS NULL
        WHEN 'contacted' THEN l.last_contact_at IS NOT NULL
        WHEN 'overdue'   THEN l.assigned_to IS NOT NULL AND l.status IS NULL AND l.next_contact_at < now()
        ELSE true END
    ),
    stats AS (
      SELECT jsonb_build_object(
        'total', count(*),
        'contacted', count(*) FILTER (WHERE last_contact_at IS NOT NULL),
        'pending', count(*) FILTER (WHERE last_contact_at IS NULL),
        'rate', CASE WHEN count(*) = 0 THEN 0
                     ELSE round(100.0 * count(*) FILTER (WHERE last_contact_at IS NOT NULL) / count(*)) END,
        'gdtd', count(*) FILTER (WHERE status = 'GDTD'),
        'b10', CASE WHEN $19 THEN count(*) FILTER (WHERE b10_synced_at IS NOT NULL) ELSE 0 END
      ) AS j FROM base
    ),
    total AS (
      SELECT count(*)::bigint AS c FROM tabbed
    ),
    page AS (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) AS j FROM (
        SELECT l.id, l.full_name, l.phone, l.source, l.status, l.created_at,
               l.last_contact_at, l.next_contact_at, l.last_note, l.fail_reason,
               coalesce(l.no_answer_count,0) AS no_answer_count,
               l.b10_status, (l.b10_synced_at IS NOT NULL) AS b10_on, l.b10_care_note,
               l.brand_id, coalesce(b.name,'—') AS brand_name,
               l.model_id, m.name AS model_name,
               l.showroom_id, sr.name AS showroom_name,
               l.sales_team_id, st.name AS team_name,
               l.assigned_to, u.full_name AS assignee_name,
               (SELECT count(*) FROM crm_thacoauto.lead_logs g WHERE g.lead_id = l.id AND g.type = 'contact') AS contact_count
        FROM tabbed l
        LEFT JOIN crm_thacoauto.brands b ON b.id = l.brand_id
        LEFT JOIN crm_thacoauto.models m ON m.id = l.model_id
        LEFT JOIN crm_thacoauto.showrooms sr ON sr.id = l.showroom_id
        LEFT JOIN crm_thacoauto.sales_teams st ON st.id = l.sales_team_id
        LEFT JOIN crm_thacoauto.users u ON u.id = l.assigned_to
        ORDER BY %1$s %2$s NULLS LAST, l.created_at DESC
        LIMIT $17 OFFSET $18
      ) t
    )
    SELECT jsonb_build_object(
      'rows', (SELECT j FROM page),
      'total_count', (SELECT c FROM total),
      'stats', (SELECT j FROM stats)
    )
  $q$, v_order, v_dir)
  INTO v_result
  USING p_from, p_to, p_showroom, p_brand, p_model, p_team, p_sources,
        p_assignee_none, p_assignee, p_status_none, p_status,
        p_open_brands, p_inactive_showrooms, p_q_digits, p_q_text,
        p_tab, p_limit, p_offset, p_b10;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION crm_thacoauto.leads_search_page(
  timestamptz, timestamptz, uuid, uuid, uuid, text[], uuid, boolean, text, boolean, uuid,
  text, text, text, uuid[], uuid[], text, text, int, int, boolean
) TO authenticated, service_role;
