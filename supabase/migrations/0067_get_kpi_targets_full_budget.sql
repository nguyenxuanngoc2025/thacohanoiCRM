-- 0067: get_kpi_targets — cột lấy từ Budget phải KHỚP TUYỆT ĐỐI với app Budget.
--
-- Lỗi cũ (0066): mục tiêu (plan_khqt/gdtd/khd/ns + actual_ns) INNER JOIN với kpi_model_map,
-- nên MỌI dòng budget có model_name không nằm trong map bị RƠI (vd Tải Bus "Đầu kéo- Tải nặng",
-- "Tải trung- Ben trung", "Quảng cáo chung *", "Key Showroom"...). Hệ quả: NS + KHQT/GDTD/KHĐ
-- kế hoạch bị thiếu so với Budget (vd Đài Tư digital 38 → tụt còn 15).
--
-- Sửa: MỤC TIÊU gộp thẳng từ budget_entries theo chiều gốc của Budget
-- (showroom_name, brand_name, model_name, channel), KHÔNG lọc qua map, KHÔNG rơi dòng
-- ⇒ tổng NS/KHQT/GDTD/KHĐ khớp đúng Budget. THỰC HIỆN (leads CRM) gắn vào theo map
-- (mỗi crm_model_id chọn 1 tên budget chuẩn để tránh nhân đôi).
DROP FUNCTION IF EXISTS crm_thacoauto.get_kpi_targets(uuid,int,int);
CREATE OR REPLACE FUNCTION crm_thacoauto.get_kpi_targets(
  p_company_id uuid, p_year int, p_month int
) RETURNS TABLE (
  showroom_name text, brand_name text, model_name text, channel text,
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
  -- MỤC TIÊU: gộp thẳng từ Budget theo chiều gốc (không map, không rơi dòng).
  targets AS (
    SELECT
      bs.name AS showroom_name,
      be.brand_name AS brand_name,
      be.model_name AS model_name,
      be.channel_code AS channel,
      SUM(be.plan_khqt)::int      AS plan_khqt,
      SUM(be.plan_gdtd)::int      AS plan_gdtd,
      SUM(be.plan_khd)::int       AS plan_khd,
      SUM(be.plan_ns)::numeric    AS plan_ns,
      SUM(be.actual_ns)::numeric  AS actual_ns
    FROM mkt_budget.budget_entries be
    JOIN mkt_budget.showrooms bs ON bs.id = be.showroom_id
    WHERE be.year = p_year AND be.month = p_month
      AND be.channel_code IN ('facebook','google','digital_other')
    GROUP BY bs.name, be.brand_name, be.model_name, be.channel_code
  ),
  -- Mỗi crm_model_id chọn 1 tên budget chuẩn (tránh nhân đôi khi 1 model map nhiều tên).
  model_map_canon AS (
    SELECT DISTINCT ON (km.crm_model_id)
      km.crm_model_id, km.budget_brand_name, km.budget_model_name
    FROM crm_thacoauto.kpi_model_map km
    WHERE km.company_id = p_company_id AND km.active AND km.crm_model_id IS NOT NULL
    ORDER BY km.crm_model_id, km.budget_model_name
  ),
  -- THỰC HIỆN: leads CRM, dịch model_id → (brand,model) budget qua map chuẩn.
  actuals AS (
    SELECT
      sr.name AS showroom_name,
      mc.budget_brand_name AS brand_name,
      mc.budget_model_name AS model_name,
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
    JOIN model_map_canon mc ON mc.crm_model_id = l.model_id
    CROSS JOIN month_range mr
    WHERE l.company_id = p_company_id
      AND l.created_at >= mr.from_ts AND l.created_at < mr.to_ts
      AND l.model_id IS NOT NULL
    GROUP BY sr.name, mc.budget_brand_name, mc.budget_model_name, 4
  )
  SELECT
    COALESCE(t.showroom_name, a.showroom_name)::text AS showroom_name,
    COALESCE(t.brand_name, a.brand_name)::text AS brand_name,
    COALESCE(t.model_name, a.model_name)::text AS model_name,
    COALESCE(t.channel, a.channel)::text AS channel,
    COALESCE(t.plan_khqt,0), COALESCE(t.plan_gdtd,0), COALESCE(t.plan_khd,0),
    COALESCE(t.plan_ns,0), COALESCE(t.actual_ns,0),
    COALESCE(a.actual_khqt,0), COALESCE(a.actual_gdtd,0), COALESCE(a.actual_khd,0)
  FROM targets t
  FULL OUTER JOIN actuals a
    ON  a.showroom_name = t.showroom_name
    AND a.brand_name    = t.brand_name
    AND a.model_name    = t.model_name
    AND a.channel       = t.channel
  ORDER BY 1, 2, 3, 4;
$$;

GRANT EXECUTE ON FUNCTION crm_thacoauto.get_kpi_targets(uuid,int,int) TO authenticated, service_role;
