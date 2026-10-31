ALTER TABLE public.doc_patterns ADD COLUMN IF NOT EXISTS explanation text;
ALTER TABLE public.doc_patterns ADD COLUMN IF NOT EXISTS accounts jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS pattern_id uuid REFERENCES public.doc_patterns(id) ON DELETE SET NULL;
ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS pattern_notes jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.tenant_settings.doc_type_accounts IS 'Primary pattern main accounts per document type (edited from pattern management).';
ALTER FUNCTION public.post_document(uuid) RENAME TO post_document_core;
CREATE OR REPLACE FUNCTION public.post_document(_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record; pmain text; old jsonb; r uuid;
BEGIN
  SELECT id, tenant_id, doc_type, pattern_id INTO d FROM public.documents WHERE id=_id AND tenant_id=public.my_tenant_id();
  IF FOUND AND d.pattern_id IS NOT NULL THEN
    SELECT nullif(p.accounts->>'main','') INTO pmain FROM public.doc_patterns p WHERE p.id=d.pattern_id AND p.tenant_id=d.tenant_id;
    IF pmain IS NOT NULL AND EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=pmain::uuid AND a.tenant_id=d.tenant_id AND NOT a.is_group) THEN
      SELECT doc_type_accounts INTO old FROM public.tenant_settings WHERE tenant_id=d.tenant_id;
      UPDATE public.tenant_settings SET doc_type_accounts = coalesce(old,'{}'::jsonb) || jsonb_build_object(d.doc_type::text, pmain) WHERE tenant_id=d.tenant_id;
      r := public.post_document_core(_id);
      UPDATE public.tenant_settings SET doc_type_accounts = coalesce(old,'{}'::jsonb) WHERE tenant_id=d.tenant_id;
      RETURN r;
    END IF;
  END IF;
  RETURN public.post_document_core(_id);
END $$;
REVOKE ALL ON FUNCTION public.post_document_core(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.post_document(uuid) TO authenticated, service_role;