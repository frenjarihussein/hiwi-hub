DO $mig$
DECLARE src text; n text;
BEGIN
  src := pg_get_functiondef('public.post_document_core(uuid)'::regprocedure);
  n := src;
  -- 1) fallback inventory account to the document warehouse account
  n := replace(n, 'cash := coalesce(d.cash_account_id,d.account_id,s.cash_account_id);',
    'cash := coalesce(d.cash_account_id,d.account_id,s.cash_account_id);
  IF s.inventory_account_id IS NULL THEN SELECT w.account_id INTO s.inventory_account_id FROM public.warehouses w WHERE w.id=d.warehouse_id AND w.tenant_id=d.tenant_id; END IF;
  IF s.inventory_account_id IS NULL THEN SELECT w.account_id INTO s.inventory_account_id FROM public.document_lines dl JOIN public.warehouses w ON w.id=dl.warehouse_id WHERE dl.document_id=_id AND w.account_id IS NOT NULL LIMIT 1; END IF;');
  -- 2) cash fallback for partner side
  n := replace(n, 'pacc := coalesce(pacc,s.customers_account_id);', 'pacc := coalesce(pacc,s.customers_account_id,cash);');
  n := replace(n, 'pacc := coalesce(pacc,s.suppliers_account_id);', 'pacc := coalesce(pacc,s.suppliers_account_id,cash);');
  -- 3) user-entered cost price wins for transfer / stock_out
  n := replace(n, '      c := coalesce(c,0);',
    '      c := coalesce(c,0);
      IF d.doc_type IN (''stock_out'',''transfer'') AND coalesce(l.unit_price,0)>0 THEN c := l.unit_price/coalesce(nullif(d.exchange_rate,0),1); END IF;');
  -- 4) accumulate transfer warehouse accounts
  n := replace(n, 'VALUES (d.tenant_id,l.product_id,d.to_warehouse_id,d.doc_date,''in'',l.qty,c,_id,''transfer'');',
    'VALUES (d.tenant_id,l.product_id,d.to_warehouse_id,d.doc_date,''in'',l.qty,c,_id,''transfer'');
          SELECT account_id INTO wacc FROM warehouses WHERE id=d.to_warehouse_id;
          IF wacc IS NOT NULL THEN svj := jsonb_set(svj, ARRAY[wacc::text], to_jsonb(coalesce((svj->>wacc::text)::numeric,0)+l.qty*c)); END IF;
          SELECT account_id INTO wacc FROM warehouses WHERE id=coalesce(l.warehouse_id,d.warehouse_id);
          IF wacc IS NOT NULL THEN svj := jsonb_set(svj, ARRAY[wacc::text], to_jsonb(coalesce((svj->>wacc::text)::numeric,0)-l.qty*c)); END IF;');
  -- 5) post the transfer entry
  n := replace(n, '  IF e IS NOT NULL AND d.doc_type IN (''sale'',''sale_return'',''purchase'',''purchase_return'') THEN',
    '  IF d.doc_type=''transfer'' AND EXISTS(SELECT 1 FROM jsonb_each_text(svj) j WHERE round(j.value::numeric,4)<>0) THEN
    INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,document_id,created_by,branch_id)
      VALUES (d.tenant_id,0,d.doc_date,coalesce(d.notes,''مناقلة مخزنية رقم ''||d.doc_no),d.currency,d.exchange_rate,d.doc_type,_id,auth.uid(),d.branch_id) RETURNING id INTO e;
    FOR bk,bv IN SELECT j.key, round(j.value::numeric*coalesce(nullif(d.exchange_rate,0),1),4) FROM jsonb_each_text(svj) j LOOP
      IF bv<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit,branch_id) VALUES (d.tenant_id,e,bk::uuid,''مناقلة مخزنية رقم ''||d.doc_no,greatest(bv,0),greatest(-bv,0),d.branch_id); END IF;
    END LOOP;
  END IF;
  IF e IS NOT NULL AND d.doc_type IN (''sale'',''sale_return'',''purchase'',''purchase_return'') THEN');
  IF n = src OR position('مناقلة مخزنية' in n)=0 OR position('l.unit_price/coalesce(nullif(d.exchange_rate,0),1); END IF;' in n)=0 OR position('SELECT w.account_id INTO s.inventory_account_id' in n)=0 THEN
    RAISE EXCEPTION 'patch targets not found';
  END IF;
  EXECUTE n;
END $mig$;