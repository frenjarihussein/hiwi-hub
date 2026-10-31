ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS theme_colors jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.set_tenant_theme(_logo text, _colors jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t uuid := public.current_tenant_id(); c text;
BEGIN
  IF t IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;
  IF NOT (public.is_tenant_admin() OR public.has_perm('project_users','create')) THEN
    RAISE EXCEPTION 'لا تملك صلاحية تغيير هوية البرنامج'; END IF;
  _colors := coalesce(_colors, '[]'::jsonb);
  IF jsonb_typeof(_colors) <> 'array' OR jsonb_array_length(_colors) > 6 THEN RAISE EXCEPTION 'ألوان غير صالحة'; END IF;
  FOR c IN SELECT jsonb_array_elements_text(_colors) LOOP
    IF c !~ '^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'لون غير صالح'; END IF;
  END LOOP;
  INSERT INTO public.tenant_settings(tenant_id, logo_url, primary_color, theme_colors)
  VALUES (t, _logo, _colors->>0, _colors)
  ON CONFLICT (tenant_id) DO UPDATE SET logo_url = EXCLUDED.logo_url, primary_color = EXCLUDED.primary_color, theme_colors = EXCLUDED.theme_colors;
END $$;
REVOKE ALL ON FUNCTION public.set_tenant_theme(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_theme(text, jsonb) TO authenticated, service_role;