CREATE OR REPLACE FUNCTION public.post_document(_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; pmain text; old jsonb; r uuid; root uuid; chosen uuid; oldcap uuid; root_group boolean;
BEGIN
  SELECT id, tenant_id, doc_type, pattern_id, account_id INTO d FROM public.documents WHERE id=_id AND tenant_id=public.my_tenant_id();
  IF FOUND AND d.doc_type='opening_inventory' THEN
    -- OPENING_CAPITAL_CHOICE_V1: pattern/primary capital may be a main account (document picks a leaf under it) or a fixed leaf.
    IF d.pattern_id IS NOT NULL THEN
      SELECT nullif(p.accounts->>'main','')::uuid INTO root FROM public.doc_patterns p WHERE p.id=d.pattern_id AND p.tenant_id=d.tenant_id;
    END IF;
    SELECT capital_account_id INTO oldcap FROM public.tenant_settings WHERE tenant_id=d.tenant_id FOR UPDATE;
    root := coalesce(root, oldcap);
    SELECT is_group INTO root_group FROM public.accounts WHERE id=root AND tenant_id=d.tenant_id;
    IF root IS NOT NULL AND root_group THEN
      IF d.account_id IS NULL OR NOT EXISTS (
        WITH RECURSIVE up AS (SELECT id, parent_id FROM public.accounts WHERE id=d.account_id AND tenant_id=d.tenant_id AND NOT is_group
          UNION ALL SELECT a.id, a.parent_id FROM public.accounts a JOIN up ON a.id=up.parent_id)
        SELECT 1 FROM up WHERE id=root) THEN
        RAISE EXCEPTION 'اختر حساب رأس مال فرعياً تحت الحساب الرئيسي المحدد في النمط';
      END IF;
      chosen := d.account_id;
    ELSIF root IS NOT NULL THEN
      chosen := root;
    ELSIF d.account_id IS NOT NULL THEN
      chosen := d.account_id;
    END IF;
    IF chosen IS NOT NULL THEN
      UPDATE public.tenant_settings SET capital_account_id=chosen WHERE tenant_id=d.tenant_id;
      r := public.post_document_core(_id);
      UPDATE public.tenant_settings SET capital_account_id=oldcap WHERE tenant_id=d.tenant_id;
      RETURN r;
    END IF;
    RETURN public.post_document_core(_id);
  END IF;
  IF FOUND AND d.pattern_id IS NOT NULL THEN
    SELECT nullif(p.accounts->>'main','') INTO pmain FROM public.doc_patterns p WHERE p.id=d.pattern_id AND p.tenant_id=d.tenant_id;
    IF pmain IS NOT NULL AND EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=pmain::uuid AND a.tenant_id=d.tenant_id AND NOT a.is_group) THEN
      SELECT doc_type_accounts INTO old FROM public.tenant_settings WHERE tenant_id=d.tenant_id FOR UPDATE;
      UPDATE public.tenant_settings SET doc_type_accounts = coalesce(old,'{}'::jsonb) || jsonb_build_object(d.doc_type::text, pmain) WHERE tenant_id=d.tenant_id;
      r := public.post_document_core(_id);
      UPDATE public.tenant_settings SET doc_type_accounts = coalesce(old,'{}'::jsonb) WHERE tenant_id=d.tenant_id;
      RETURN r;
    END IF;
  END IF;
  RETURN public.post_document_core(_id);
END $function$;