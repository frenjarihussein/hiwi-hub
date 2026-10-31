CREATE TABLE IF NOT EXISTS public.restored_user_passwords (
  user_id uuid PRIMARY KEY,
  tenant_id uuid,
  temp_password text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.restored_user_passwords TO authenticated;
GRANT ALL ON public.restored_user_passwords TO service_role;
ALTER TABLE public.restored_user_passwords ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rup_owner_select ON public.restored_user_passwords;
CREATE POLICY rup_owner_select ON public.restored_user_passwords FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS rup_owner_delete ON public.restored_user_passwords;
CREATE POLICY rup_owner_delete ON public.restored_user_passwords FOR DELETE TO authenticated USING (public.is_super_admin());