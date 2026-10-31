CREATE OR REPLACE FUNCTION public.post_document(_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record; pmain text; old jsonb; r uuid;
BEGIN
  SELECT id, tenant_id, doc_type, pattern_id INTO d FROM public.documents WHERE id=_id AND tenant_id=public.my_tenant_id();
  IF FOUND AND d.pattern_id IS NOT NULL THEN
    SELECT nullif(p.accounts->>'main','') INTO pmain FROM public.doc_patterns p WHERE p.id=d.pattern_id AND p.tenant_id=d.tenant_id;
    IF pmain IS NOT NULL AND EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=pmain::uuid AND a.tenant_id=d.tenant_id AND NOT a.is_group) THEN
      -- Row lock serialises pattern postings per company; the override never commits, so other sessions only see the original links.
      SELECT doc_type_accounts INTO old FROM public.tenant_settings WHERE tenant_id=d.tenant_id FOR UPDATE;
      UPDATE public.tenant_settings SET doc_type_accounts = coalesce(old,'{}'::jsonb) || jsonb_build_object(d.doc_type::text, pmain) WHERE tenant_id=d.tenant_id;
      r := public.post_document_core(_id);
      UPDATE public.tenant_settings SET doc_type_accounts = coalesce(old,'{}'::jsonb) WHERE tenant_id=d.tenant_id;
      RETURN r;
    END IF;
  END IF;
  RETURN public.post_document_core(_id);
END $$;
GRANT EXECUTE ON FUNCTION public.post_document(uuid) TO authenticated, service_role;