CREATE TABLE public.desktop_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  customer text NOT NULL,
  plan text NOT NULL DEFAULT 'year',
  expires_at timestamptz,
  license_key text NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.desktop_licenses TO authenticated;
GRANT ALL ON public.desktop_licenses TO service_role;
ALTER TABLE public.desktop_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admins manage licenses" ON public.desktop_licenses FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TABLE public.desktop_devices (
  device_id text PRIMARY KEY,
  license_id uuid REFERENCES public.desktop_licenses(id) ON DELETE SET NULL,
  customer text,
  app_version text,
  company_name text,
  platform text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  last_ip text
);
GRANT SELECT, UPDATE, DELETE ON public.desktop_devices TO authenticated;
GRANT ALL ON public.desktop_devices TO service_role;
ALTER TABLE public.desktop_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admins view devices" ON public.desktop_devices FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());