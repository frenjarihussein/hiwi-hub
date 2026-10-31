ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.clear_must_change_password() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE public.profiles SET must_change_password=false WHERE id=auth.uid();
$$;
REVOKE ALL ON FUNCTION public.clear_must_change_password() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.clear_must_change_password() TO authenticated;