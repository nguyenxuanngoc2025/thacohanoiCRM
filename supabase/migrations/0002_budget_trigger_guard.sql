-- Sửa trigger Budget: bỏ qua khi auth user có metadata app='crm'
-- Giữ nguyên hành vi với user Budget (app khác hoặc trống).
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mkt_budget', 'public', 'auth', 'pg_catalog'
AS $function$
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'app', '') = 'crm' THEN
    RETURN NEW;  -- user thuộc CRM → KHÔNG chèn vào mkt_budget.users
  END IF;
  INSERT INTO mkt_budget.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'mkt_showroom'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;
