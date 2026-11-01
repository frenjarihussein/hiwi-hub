CREATE TABLE public.desktop_activation_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  batch text,
  customer text NOT NULL,
  plan text NOT NULL DEFAULT 'year',
  days integer NOT NULL DEFAULT 0,
  revoked boolean NOT NULL DEFAULT false,
  used_device text,
  used_at timestamptz,
  license_id uuid REFERENCES public.desktop_licenses(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.desktop_activation_codes TO authenticated;
GRANT ALL ON public.desktop_activation_codes TO service_role;
ALTER TABLE public.desktop_activation_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admins manage activation codes" ON public.desktop_activation_codes FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

ALTER TABLE public.desktop_devices
  ADD COLUMN IF NOT EXISTS hostname text,
  ADD COLUMN IF NOT EXISTS os_name text,
  ADD COLUMN IF NOT EXISTS cpu text,
  ADD COLUMN IF NOT EXISTS ram_gb numeric,
  ADD COLUMN IF NOT EXISTS specs jsonb,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_code text;