ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS white_label boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.set_tenant_white_label(_on boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t uuid := public.current_tenant_id();
BEGIN
  IF t IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;
  IF NOT (public.is_tenant_admin() OR public.has_perm('project_users','create')) THEN
    RAISE EXCEPTION 'لا تملك صلاحية تغيير هوية البرنامج'; END IF;
  INSERT INTO public.tenant_settings(tenant_id, white_label) VALUES (t, coalesce(_on,true))
  ON CONFLICT (tenant_id) DO UPDATE SET white_label = EXCLUDED.white_label;
END $$;
REVOKE ALL ON FUNCTION public.set_tenant_white_label(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_white_label(boolean) TO authenticated, service_role;