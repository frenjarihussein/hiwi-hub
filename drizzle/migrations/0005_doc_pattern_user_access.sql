ALTER TABLE public.doc_patterns ADD COLUMN IF NOT EXISTS allowed_user_ids uuid[] NOT NULL DEFAULT '{}';
DROP POLICY IF EXISTS dp_select ON public.doc_patterns;
CREATE POLICY dp_select ON public.doc_patterns FOR SELECT TO authenticated USING (
  tenant_id = public.current_tenant_id() AND (
    cardinality(allowed_user_ids) = 0 OR auth.uid() = ANY(allowed_user_ids)
    OR public.is_tenant_admin() OR public.has_perm('settings'::text, 'edit'::perm_action)
  )
);