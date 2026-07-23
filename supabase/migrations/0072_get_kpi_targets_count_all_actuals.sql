-- 0072: get_kpi_targets — ĐẾM ĐỦ MỌI LEAD để KHỚP CHÍNH XÁC với Bảng Quản trị.
--
-- Vấn đề 0071: actuals chỉ gắn được vào KHUNG budget (LEFT JOIN targets→actuals) ⇒
-- lead NGOÀI kế hoạch (showroom×dòng×kênh không có trong budget) hoặc CHƯA RÕ DÒNG XE
-- bị RỚT khỏi tổng ⇒ tổng KPI < tổng Bảng Quản trị.
--
-- Sửa: FULL OUTER JOIN targets ⟷ actuals. actuals đếm MỌI lead trong kỳ, MIRROR đúng
-- bộ lọc của trang báo cáo:
--   • hãng đang mở (company_brands whitelist; rỗng = không lọc)
--   • showroom KHÔNG tắt (is_active IS NOT FALSE; giữ cả lead chưa gán showroom)
--   • phễu LUỸ TIẾN (KHQT = đạt ≥ nấc KHQT, gồm cả GDTD+KHĐ) + trạng thái TỐT NHẤT (app ⊕ B10).
-- Nhãn hãng/dòng xe của actuals quy về TÊN BUDGET (rev_map/brand_map) để gom CHUNG nhóm với
-- khung, tránh tách "TẢI BUS" (budget) vs "Tải Bus" (CRM). Lead chưa rõ dòng xe ⇒ '(Chưa rõ dòng xe)'.
DROP FUNCTION IF EXISTS crm_thacoauto.get_kpi_targets(uuid,int,int);
CREATE OR REPLACE FUNCTION crm_thacoauto.get_kpi_targets(
  p_company_id uuid, p_year int, p_month int
) RETURNS TABLE (
  showroom_name text, brand_name text, model_name text, channel text, crm_model_id uuid,
  showroom_sort numeric, model_sort int,
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
  -- (brand,model) budget → crm_model_id (cho khung targets).
  map_by_budget AS (
    SELECT DISTINCT ON (km.budget_brand_name, km.budget_model_name)
      km.budget_brand_name, km.budget_model_name, km.crm_model_id
    FROM crm_thacoauto.kpi_model_map km
    WHERE km.company_id = p_company_id AND km.active AND km.crm_model_id IS NOT NULL
    ORDER BY km.budget_brand_name, km.budget_model_name, km.crm_model_id
  ),
  -- crm_model_id → tên (brand,model) budget (cho actuals có dòng xe).
  rev_map AS (
    SELECT DISTINCT ON (km.crm_model_id)
      km.crm_model_id, km.budget_brand_name, km.budget_model_name
    FROM crm_thacoauto.kpi_model_map km
    WHERE km.company_id = p_company_id AND km.active AND km.crm_model_id IS NOT NULL
    ORDER BY km.crm_model_id, km.budget_brand_name, km.budget_model_name
  ),
  -- crm brand_id → tên hãng budget (cho lead CHƯA RÕ DÒNG XE, chỉ có brand).
  brand_map AS (
    SELECT DISTINCT ON (cm.brand_id) cm.brand_id AS crm_brand_id, km.budget_brand_name
    FROM crm_thacoauto.kpi_model_map km
    JOIN crm_thacoauto.models cm ON cm.id = km.crm_model_id
    WHERE km.company_id = p_company_id AND km.active AND km.crm_model_id IS NOT NULL
    ORDER BY cm.brand_id, km.budget_brand_name
  ),
  -- Thứ tự dòng xe Budget: master_models.sort_order theo (brand_name, name).
  model_sort AS (
    SELECT DISTINCT ON (mm.brand_name, mm.name)
      mm.brand_name, mm.name, mm.sort_order
    FROM mkt_budget.master_models mm
    ORDER BY mm.brand_name, mm.name, mm.sort_order
  ),
  -- Weight showroom Budget theo tên (xếp giảm dần).
  sr_weight AS (
    SELECT name, MAX(weight) AS weight FROM mkt_budget.showrooms GROUP BY name
  ),
  open_brands AS (
    SELECT brand_id FROM crm_thacoauto.company_brands WHERE company_id = p_company_id
  ),
  targets AS (
    SELECT
      bs.name AS showroom_name,
      be.brand_name AS brand_name,
      be.model_name AS model_name,
      be.channel_code AS channel,
      mb.crm_model_id AS crm_model_id,
      MAX(bs.weight)          AS showroom_sort,
      MAX(ms.sort_order)      AS model_sort,
      SUM(be.plan_khqt)::int      AS plan_khqt,
      SUM(be.plan_gdtd)::int      AS plan_gdtd,
      SUM(be.plan_khd)::int       AS plan_khd,
      SUM(be.plan_ns)::numeric    AS plan_ns,
      SUM(be.actual_ns)::numeric  AS actual_ns
    FROM mkt_budget.budget_entries be
    JOIN mkt_budget.showrooms bs ON bs.id = be.showroom_id
    LEFT JOIN map_by_budget mb
      ON mb.budget_brand_name = be.brand_name AND mb.budget_model_name = be.model_name
    LEFT JOIN model_sort ms
      ON ms.brand_name = be.brand_name AND ms.name = be.model_name
    WHERE be.year = p_year AND be.month = p_month
      AND be.channel_code IN ('facebook','google','digital_other')
    GROUP BY bs.name, be.brand_name, be.model_name, be.channel_code, mb.crm_model_id
  ),
  actuals AS (
    SELECT
      COALESCE(sr.name, '(Chưa gán showroom)') AS showroom_name,
      l.model_id AS crm_model_id,
      COALESCE(rv.budget_brand_name, bm.budget_brand_name, cb.name, '(Không rõ thương hiệu)') AS brand_name,
      COALESCE(rv.budget_model_name, cm.name, '(Chưa rõ dòng xe)') AS model_name,
      CASE
        WHEN l.source IN ('facebook','fb_message','fb_comment','facebook_tool') THEN 'facebook'
        WHEN l.source LIKE 'google%' THEN 'google'
        ELSE 'digital_other'
      END AS channel,
      MAX(COALESCE(swt.weight, 0))     AS showroom_sort,
      MAX(COALESCE(msn.sort_order, 9999)) AS model_sort,
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
    LEFT JOIN crm_thacoauto.showrooms sr ON sr.id = l.showroom_id
    LEFT JOIN rev_map rv   ON rv.crm_model_id = l.model_id
    LEFT JOIN brand_map bm ON bm.crm_brand_id = l.brand_id
    LEFT JOIN crm_thacoauto.models cm ON cm.id = l.model_id
    LEFT JOIN crm_thacoauto.brands cb ON cb.id = l.brand_id
    LEFT JOIN sr_weight swt ON swt.name = sr.name
    LEFT JOIN model_sort msn
      ON msn.brand_name = COALESCE(rv.budget_brand_name, bm.budget_brand_name, cb.name)
     AND msn.name       = COALESCE(rv.budget_model_name, cm.name)
    CROSS JOIN month_range mr
    WHERE l.company_id = p_company_id
      AND l.created_at >= mr.from_ts AND l.created_at < mr.to_ts
      AND sr.is_active IS NOT FALSE
      AND (NOT EXISTS (SELECT 1 FROM open_brands)
           OR l.brand_id IN (SELECT brand_id FROM open_brands))
    GROUP BY
      COALESCE(sr.name, '(Chưa gán showroom)'),
      l.model_id,
      COALESCE(rv.budget_brand_name, bm.budget_brand_name, cb.name, '(Không rõ thương hiệu)'),
      COALESCE(rv.budget_model_name, cm.name, '(Chưa rõ dòng xe)'),
      CASE
        WHEN l.source IN ('facebook','fb_message','fb_comment','facebook_tool') THEN 'facebook'
        WHEN l.source LIKE 'google%' THEN 'google'
        ELSE 'digital_other'
      END
  )
  SELECT
    COALESCE(t.showroom_name, a.showroom_name)::text,
    COALESCE(t.brand_name, a.brand_name)::text,
    COALESCE(t.model_name, a.model_name)::text,
    COALESCE(t.channel, a.channel)::text,
    COALESCE(t.crm_model_id, a.crm_model_id),
    COALESCE(t.showroom_sort, a.showroom_sort, 0)::numeric,
    COALESCE(t.model_sort, a.model_sort, 9999)::int,
    COALESCE(t.plan_khqt,0), COALESCE(t.plan_gdtd,0), COALESCE(t.plan_khd,0),
    COALESCE(t.plan_ns,0), COALESCE(t.actual_ns,0),
    COALESCE(a.actual_khqt,0), COALESCE(a.actual_gdtd,0), COALESCE(a.actual_khd,0)
  FROM targets t
  FULL OUTER JOIN actuals a
    ON  a.showroom_name = t.showroom_name
    AND a.channel       = t.channel
    AND a.crm_model_id  = t.crm_model_id
  ORDER BY 1, 2, 3, 4;
$$;

GRANT EXECUTE ON FUNCTION crm_thacoauto.get_kpi_targets(uuid,int,int) TO authenticated, service_role;
