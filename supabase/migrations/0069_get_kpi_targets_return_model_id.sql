-- 0069: get_kpi_targets — trả thêm crm_model_id để BỘ LỌC báo cáo lọc theo MÃ dòng xe.
--
-- Lỗi trước: frontend lọc KPI theo TÊN thương hiệu/dòng xe, nhưng tên Budget vênh tên CRM
-- (hoa/thường "TẢI BUS" vs "Tải Bus"; dấu cách "Đầu kéo- Tải nặng" vs "Đầu kéo - Tải nặng")
-- ⇒ lọc thương hiệu Tải Bus ra RỖNG. Trả crm_model_id để lọc dòng xe theo mã (khớp id CRM),
-- thương hiệu so không phân biệt hoa/thường ở frontend.
--
-- (Giữ nguyên logic 0068): khung = budget_entries (LEFT JOIN — thuần Budget, KHÔNG rơi dòng ⇒
-- NS/KPI khớp Budget). Thực hiện (leads) gộp theo (showroom, crm_model_id, kênh) rồi LEFT JOIN
-- vào khung theo crm_model_id ⇒ miễn nhiễm lỗi tên. Dòng Budget không map vẫn giữ NS, TH = 0.
DROP FUNCTION IF EXISTS crm_thacoauto.get_kpi_targets(uuid,int,int);
CREATE OR REPLACE FUNCTION crm_thacoauto.get_kpi_targets(
  p_company_id uuid, p_year int, p_month int
) RETURNS TABLE (
  showroom_name text, brand_name text, model_name text, channel text, crm_model_id uuid,
  plan_khqt int, plan_gdtd int, plan_khd int, plan_ns numeric, actual_ns numeric,
  actual_khqt int, actual_gdtd int, actual_khd int
)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'crm_thacoauto','mkt_budget','public','auth','pg_catalog'
AS $$
  WITH month_start AS (
    SELECT make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Ho_Chi_Minh') AS s
  ),
  month_range AS (
    SELECT s AS from_ts, (s + interval '1 month') AS to_ts FROM month_start
  ),
  -- Map theo (brand,model) budget → 1 crm_model_id (chọn 1 để tránh nhân đôi khung).
  map_by_budget AS (
    SELECT DISTINCT ON (km.budget_brand_name, km.budget_model_name)
      km.budget_brand_name, km.budget_model_name, km.crm_model_id
    FROM crm_thacoauto.kpi_model_map km
    WHERE km.company_id = p_company_id AND km.active AND km.crm_model_id IS NOT NULL
    ORDER BY km.budget_brand_name, km.budget_model_name, km.crm_model_id
  ),
  -- KHUNG + MỤC TIÊU: gộp thẳng từ Budget (không rơi dòng), kèm crm_model_id để gắn thực hiện.
  targets AS (
    SELECT
      bs.name AS showroom_name,
      be.brand_name AS brand_name,
      be.model_name AS model_name,
      be.channel_code AS channel,
      mb.crm_model_id AS crm_model_id,
      SUM(be.plan_khqt)::int      AS plan_khqt,
      SUM(be.plan_gdtd)::int      AS plan_gdtd,
      SUM(be.plan_khd)::int       AS plan_khd,
      SUM(be.plan_ns)::numeric    AS plan_ns,
      SUM(be.actual_ns)::numeric  AS actual_ns
    FROM mkt_budget.budget_entries be
    JOIN mkt_budget.showrooms bs ON bs.id = be.showroom_id
    LEFT JOIN map_by_budget mb
      ON mb.budget_brand_name = be.brand_name AND mb.budget_model_name = be.model_name
    WHERE be.year = p_year AND be.month = p_month
      AND be.channel_code IN ('facebook','google','digital_other')
    GROUP BY bs.name, be.brand_name, be.model_name, be.channel_code, mb.crm_model_id
  ),
  -- THỰC HIỆN từ CRM: gộp theo (showroom, crm_model_id, kênh).
  actuals AS (
    SELECT
      sr.name AS showroom_name,
      l.model_id AS crm_model_id,
      CASE
        WHEN l.source IN ('facebook','fb_message','fb_comment','facebook_tool') THEN 'facebook'
        WHEN l.source LIKE 'google%' THEN 'google'
        ELSE 'digital_other'
      END AS channel,
      COUNT(*) FILTER (WHERE GREATEST(
        CASE l.status     WHEN 'Chưa LH được' THEN 1 WHEN 'Fail' THEN 2 WHEN 'KHQT' THEN 3 WHEN 'GDTD' THEN 4 WHEN 'KHĐ' THEN 5 ELSE 0 END,
        CASE l.b10_status WHEN 'Chưa LH được' THEN 1 WHEN 'Fail' THEN 2 WHEN 'KHQT' THEN 3 WHEN 'GDTD' THEN 4 WHEN 'KHĐ' THEN 5 ELSE 0 END
      ) >= 3)::int AS actual_khqt,
      COUNT(*) FILTER (WHERE GREATEST(
        CASE l.status     WHEN 'Chưa LH được' THEN 1 WHEN 'Fail' THEN 2 WHEN 'KHQT' THEN 3 WHEN 'GDTD' THEN 4 WHEN 'KHĐ' THEN 5 ELSE 0 END,
        CASE l.b10_status WHEN 'Chưa LH được' THEN 1 WHEN 'Fail' THEN 2 WHEN 'KHQT' THEN 3 WHEN 'GDTD' THEN 4 WHEN 'KHĐ' THEN 5 ELSE 0 END
      ) >= 4)::int AS actual_gdtd,
      COUNT(*) FILTER (WHERE GREATEST(
        CASE l.status     WHEN 'Chưa LH được' THEN 1 WHEN 'Fail' THEN 2 WHEN 'KHQT' THEN 3 WHEN 'GDTD' THEN 4 WHEN 'KHĐ' THEN 5 ELSE 0 END,
        CASE l.b10_status WHEN 'Chưa LH được' THEN 1 WHEN 'Fail' THEN 2 WHEN 'KHQT' THEN 3 WHEN 'GDTD' THEN 4 WHEN 'KHĐ' THEN 5 ELSE 0 END
      ) = 5)::int AS actual_khd
    FROM crm_thacoauto.leads l
    JOIN crm_thacoauto.showrooms sr ON sr.id = l.showroom_id
    CROSS JOIN month_range mr
    WHERE l.company_id = p_company_id
      AND l.created_at >= mr.from_ts AND l.created_at < mr.to_ts
      AND l.model_id IS NOT NULL
    GROUP BY sr.name, l.model_id, 3
  )
  SELECT
    t.showroom_name::text,
    t.brand_name::text,
    t.model_name::text,
    t.channel::text,
    t.crm_model_id,
    COALESCE(t.plan_khqt,0), COALESCE(t.plan_gdtd,0), COALESCE(t.plan_khd,0),
    COALESCE(t.plan_ns,0), COALESCE(t.actual_ns,0),
    COALESCE(a.actual_khqt,0), COALESCE(a.actual_gdtd,0), COALESCE(a.actual_khd,0)
  FROM targets t
  LEFT JOIN actuals a
    ON  a.showroom_name = t.showroom_name
    AND a.channel       = t.channel
    AND a.crm_model_id  = t.crm_model_id
  ORDER BY 1, 2, 3, 4;
$$;

GRANT EXECUTE ON FUNCTION crm_thacoauto.get_kpi_targets(uuid,int,int) TO authenticated, service_role;
