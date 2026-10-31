ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_doc_type_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_doc_type_check CHECK (doc_type = ANY (ARRAY['sale','purchase','receipt','payment','transfer','stock_in','stock_out','quote','sale_return','purchase_return','purchase_request','purchase_order','payment_order','opening_inventory','closing_inventory','stocktake']));

CREATE OR REPLACE FUNCTION public.block_nonposting_docs() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status='posted' AND NEW.doc_type IN ('purchase_request','purchase_order','payment_order') THEN
    RAISE EXCEPTION 'هذا المستند لا يُرحّل ولا يولّد قيداً';
  END IF;
  IF NEW.status='posted' AND NEW.doc_type='stocktake' AND current_setting('app.stocktake', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'يُعتمد مستند الجرد المخزني من شاشة الجرد فقط';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.finalize_stocktake(_id uuid, _entries uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id=_id AND tenant_id=public.my_tenant_id() FOR UPDATE;
  IF NOT FOUND OR d.doc_type<>'stocktake' THEN RAISE EXCEPTION 'مستند الجرد غير موجود'; END IF;
  IF NOT (public.is_tenant_admin() OR public.has_perm('documents','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF d.status='posted' THEN RETURN; END IF;
  PERFORM set_config('app.posting','on',true);
  PERFORM set_config('app.stocktake','on',true);
  UPDATE public.documents SET status='posted', journal_entry_id=_entries[1] WHERE id=_id;
  UPDATE public.journal_entries SET document_id=_id, doc_type='stocktake' WHERE id = ANY(coalesce(_entries,'{}')) AND tenant_id=d.tenant_id AND document_id IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.finalize_stocktake(uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finalize_stocktake(uuid, uuid[]) TO authenticated, service_role;