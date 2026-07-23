-- 0064b: sync_actuals_from_crm — đọc CRM leads, ghi actual_* vào mkt_budget.budget_entries.
-- p_dry_run = true: KHÔNG ghi, chỉ trả preview. false: UPDATE thật.
CREATE OR REPLACE FUNCTION mkt_budget.sync_actuals_from_crm(
  p_year int, p_month int, p_dry_run boolean DEFAULT true
) RETURNS TABLE (
  showroom_name text, brand_name text, model_name text, channel_code text,
  old_khqt int, old_gdtd int, old_khd int,
  new_khqt int, new_gdtd int, new_khd int, changed boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'mkt_budget','crm_thacoauto','public','auth','pg_catalog'
AS $$
DECLARE
  c_hn uuid := 'ec6b9c22-1317-4884-a496-cf0793d6c7b8';
BEGIN
  RETURN QUERY
  WITH month_range AS (
    SELECT make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Ho_Chi_Minh') AS from_ts,
           make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Ho_Chi_Minh') + interval '1 month' AS to_ts
  ),
  -- Thực hiện CRM theo showroom(tên) x crm_model_id x kênh
  crm_actual AS (
    SELECT sr.name AS showroom_name, l.model_id AS crm_model_id,
      CASE
        WHEN l.source IN ('facebook','fb_message','fb_comment','facebook_tool') THEN 'facebook'
        WHEN l.source LIKE 'google%' THEN 'google'
        ELSE 'digital_other'
      END AS channel_code,
      COUNT(*) FILTER (WHERE GREATEST(
        CASE l.status     WHEN 'Chưa LH được' THEN 1 WHEN 'Fail' THEN 2 WHEN 'KHQT' THEN 3 WHEN 'GDTD' THEN 4 WHEN 'KHĐ' THEN 5 ELSE 0 END,
        CASE l.b10_status WHEN 'Chưa LH được' THEN 1 WHEN 'Fail' THEN 2 WHEN 'KHQT' THEN 3 WHEN 'GDTD' THEN 4 WHEN 'KHĐ' THEN 5 ELSE 0 END
      ) >= 3)::int AS a_khqt,
      COUNT(*) FILTER (WHERE GREATEST(
        CASE l.status     WHEN 'Chưa LH được' THEN 1 WHEN 'Fail' THEN 2 WHEN 'KHQT' THEN 3 WHEN 'GDTD' THEN 4 WHEN 'KHĐ' THEN 5 ELSE 0 END,
        CASE l.b10_status WHEN 'Chưa LH được' THEN 1 WHEN 'Fail' THEN 2 WHEN 'KHQT' THEN 3 WHEN 'GDTD' THEN 4 WHEN 'KHĐ' THEN 5 ELSE 0 END
      ) >= 4)::int AS a_gdtd,
      COUNT(*) FILTER (WHERE GREATEST(
        CASE l.status     WHEN 'Chưa LH được' THEN 1 WHEN 'Fail' THEN 2 WHEN 'KHQT' THEN 3 WHEN 'GDTD' THEN 4 WHEN 'KHĐ' THEN 5 ELSE 0 END,
        CASE l.b10_status WHEN 'Chưa LH được' THEN 1 WHEN 'Fail' THEN 2 WHEN 'KHQT' THEN 3 WHEN 'GDTD' THEN 4 WHEN 'KHĐ' THEN 5 ELSE 0 END
      ) = 5)::int AS a_khd
    FROM crm_thacoauto.leads l
    JOIN crm_thacoauto.showrooms sr ON sr.id = l.showroom_id
    CROSS JOIN month_range mr
    WHERE l.company_id = c_hn AND l.model_id IS NOT NULL
      AND l.created_at >= mr.from_ts AND l.created_at < mr.to_ts
    GROUP BY sr.name, l.model_id, 3
  ),
  -- Ánh xạ về khoá budget (brand_name, model_name) qua kpi_model_map
  mapped AS (
    SELECT bs.name AS showroom_name, km.budget_brand_name, km.budget_model_name,
           ca.channel_code, ca.a_khqt, ca.a_gdtd, ca.a_khd
    FROM crm_actual ca
    JOIN crm_thacoauto.kpi_model_map km
      ON km.company_id = c_hn AND km.active AND km.crm_model_id = ca.crm_model_id
    JOIN mkt_budget.showrooms bs ON bs.name = ca.showroom_name
  ),
  -- Ghép vào các ô budget_entries đang tồn tại của tháng
  joined AS (
    SELECT be.id, bs.name AS showroom_name, be.brand_name, be.model_name, be.channel_code,
           COALESCE(be.actual_khqt,0) AS old_khqt, COALESCE(be.actual_gdtd,0) AS old_gdtd, COALESCE(be.actual_khd,0) AS old_khd,
           COALESCE(mp.a_khqt,0) AS new_khqt, COALESCE(mp.a_gdtd,0) AS new_gdtd, COALESCE(mp.a_khd,0) AS new_khd
    FROM mkt_budget.budget_entries be
    JOIN mkt_budget.showrooms bs ON bs.id = be.showroom_id
    JOIN mapped mp ON mp.showroom_name = bs.name
                  AND mp.budget_brand_name = be.brand_name
                  AND mp.budget_model_name = be.model_name
                  AND mp.channel_code = be.channel_code
    WHERE be.year = p_year AND be.month = p_month
      AND be.channel_code IN ('facebook','google','digital_other')
  ),
  do_update AS (
    UPDATE mkt_budget.budget_entries be
    SET actual_khqt = j.new_khqt, actual_gdtd = j.new_gdtd, actual_khd = j.new_khd,
        actual_source = 'crm_sync', updated_at = now()
    FROM joined j
    WHERE be.id = j.id AND NOT p_dry_run
      AND (j.old_khqt, j.old_gdtd, j.old_khd) IS DISTINCT FROM (j.new_khqt, j.new_gdtd, j.new_khd)
    RETURNING be.id
  )
  SELECT j.showroom_name::text, j.brand_name::text, j.model_name::text, j.channel_code::text,
         j.old_khqt, j.old_gdtd, j.old_khd, j.new_khqt, j.new_gdtd, j.new_khd,
         (j.old_khqt, j.old_gdtd, j.old_khd) IS DISTINCT FROM (j.new_khqt, j.new_gdtd, j.new_khd) AS changed
  FROM joined j
  ORDER BY 1,2,3,4;
END;
$$;

GRANT EXECUTE ON FUNCTION mkt_budget.sync_actuals_from_crm(int,int,boolean) TO authenticated, service_role;
