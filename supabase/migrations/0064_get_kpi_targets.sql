-- 0064: get_kpi_targets — trả mục tiêu (budget) + thực hiện (CRM) theo showroom x dòng xe(CRM) x kênh(3 nhóm), tháng.
CREATE OR REPLACE FUNCTION crm_thacoauto.get_kpi_targets(
  p_company_id uuid, p_year int, p_month int
) RETURNS TABLE (
  showroom_name text, brand_name text, model_name text, channel text,
  plan_khqt int, plan_gdtd int, plan_khd int, plan_ns numeric,
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
  -- MỤC TIÊU từ budget: gộp theo showroom(tên) x crm_model_id x kênh(3 nhóm)
  targets AS (
    SELECT
      bs.name AS showroom_name,
      km.crm_model_id,
      be.channel_code AS channel,
      SUM(be.plan_khqt)::int AS plan_khqt,
      SUM(be.plan_gdtd)::int AS plan_gdtd,
      SUM(be.plan_khd)::int  AS plan_khd,
      SUM(be.plan_ns)::numeric AS plan_ns
    FROM mkt_budget.budget_entries be
    JOIN mkt_budget.showrooms bs ON bs.id = be.showroom_id
    JOIN crm_thacoauto.kpi_model_map km
      ON km.company_id = p_company_id
     AND km.active
     AND km.budget_brand_name = be.brand_name
     AND km.budget_model_name = be.model_name
     AND km.crm_model_id IS NOT NULL
    WHERE be.year = p_year AND be.month = p_month
      AND be.channel_code IN ('facebook','google','digital_other')
    GROUP BY bs.name, km.crm_model_id, be.channel_code
  ),
  -- THỰC HIỆN từ CRM: gộp theo showroom(tên) x model_id x kênh(3 nhóm)
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
    COALESCE(t.showroom_name, a.showroom_name)::text AS showroom_name,
    b.name::text AS brand_name,
    m.name::text AS model_name,
    COALESCE(t.channel, a.channel)::text AS channel,
    COALESCE(t.plan_khqt,0), COALESCE(t.plan_gdtd,0), COALESCE(t.plan_khd,0), COALESCE(t.plan_ns,0),
    COALESCE(a.actual_khqt,0), COALESCE(a.actual_gdtd,0), COALESCE(a.actual_khd,0)
  FROM targets t
  FULL OUTER JOIN actuals a
    ON a.showroom_name = t.showroom_name AND a.crm_model_id = t.crm_model_id AND a.channel = t.channel
  LEFT JOIN crm_thacoauto.models m ON m.id = COALESCE(t.crm_model_id, a.crm_model_id)
  LEFT JOIN crm_thacoauto.brands b ON b.id = m.brand_id
  ORDER BY 1, 2, 3, 4;
$$;

GRANT EXECUTE ON FUNCTION crm_thacoauto.get_kpi_targets(uuid,int,int) TO authenticated, service_role;
