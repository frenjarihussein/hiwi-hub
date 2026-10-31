ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS receipt_template jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.fiscal_close_preview()
RETURNS TABLE(account_id uuid, code text, name text, kind text, balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t uuid := my_tenant_id(); s record;
BEGIN
  IF NOT is_tenant_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO s FROM tenant_settings WHERE tenant_id=t;
  IF s.fiscal_start IS NULL OR s.fiscal_end IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT a.id, a.code::text, a.name::text,
      CASE WHEN a.nature::text IN ('profit_loss','revenues','expenses') THEN 'pl' ELSE 'bs' END,
      sum(l.debit-l.credit)
    FROM journal_lines l JOIN journal_entries j ON j.id=l.entry_id JOIN accounts a ON a.id=l.account_id
    WHERE l.tenant_id=t AND (
      (a.nature::text IN ('profit_loss','revenues','expenses') AND j.entry_date BETWEEN s.fiscal_start AND s.fiscal_end)
      OR (a.nature::text IN ('balance_sheet','assets','liabilities','equity') AND j.entry_date<=s.fiscal_end))
    GROUP BY a.id, a.code, a.name, a.nature HAVING sum(l.debit-l.credit)<>0
    ORDER BY 4 DESC, 2;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_close_preview() FROM anon;
GRANT EXECUTE ON FUNCTION public.fiscal_close_preview() TO authenticated;

CREATE OR REPLACE FUNCTION public.close_fiscal_year() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t uuid := my_tenant_id(); s record; e uuid; net numeric; ob uuid;
BEGIN
  IF NOT is_tenant_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO s FROM tenant_settings WHERE tenant_id=t;
  IF s.fiscal_start IS NULL OR s.fiscal_end IS NULL THEN RAISE EXCEPTION 'حدد السنة المالية أولاً'; END IF;
  IF s.retained_earnings_account_id IS NULL THEN RAISE EXCEPTION 'حدد حساب الأرباح المحتجزة'; END IF;
  IF s.closed_until IS NOT NULL AND s.closed_until >= s.fiscal_end THEN RAISE EXCEPTION 'هذه السنة مقفلة مسبقاً'; END IF;
  INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,created_by)
    VALUES (t,0,s.fiscal_end,'قيد إقفال السنة المالية','USD',1,'closing',auth.uid()) RETURNING id INTO e;
  INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit)
    SELECT t,e,a.id, greatest(sum(l.credit-l.debit),0), greatest(sum(l.debit-l.credit),0)
    FROM journal_lines l JOIN journal_entries j ON j.id=l.entry_id JOIN accounts a ON a.id=l.account_id
    WHERE l.tenant_id=t AND a.nature::text IN ('profit_loss','revenues','expenses') AND j.entry_date BETWEEN s.fiscal_start AND s.fiscal_end AND j.id<>e
    GROUP BY a.id HAVING sum(l.debit-l.credit)<>0;
  SELECT coalesce(sum(debit-credit),0) INTO net FROM journal_lines WHERE entry_id=e;
  IF net<>0 THEN
    INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit)
      VALUES (t,e,s.retained_earnings_account_id,'صافي نتيجة السنة',greatest(-net,0),greatest(net,0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM journal_lines WHERE entry_id=e) THEN DELETE FROM journal_entries WHERE id=e; END IF;
  INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,created_by)
    VALUES (t,0,s.fiscal_end+1,'قيد افتتاحي - تدوير الأرصدة','USD',1,'opening',auth.uid()) RETURNING id INTO ob;
  INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,debit,credit)
    SELECT t,ob,a.id,l.partner_id, greatest(sum(l.debit-l.credit),0), greatest(sum(l.credit-l.debit),0)
    FROM journal_lines l JOIN journal_entries j ON j.id=l.entry_id JOIN accounts a ON a.id=l.account_id
    WHERE l.tenant_id=t AND a.nature::text IN ('balance_sheet','assets','liabilities','equity') AND j.entry_date<=s.fiscal_end
    GROUP BY a.id,l.partner_id HAVING sum(l.debit-l.credit)<>0;
  IF NOT EXISTS (SELECT 1 FROM journal_lines WHERE entry_id=ob) THEN DELETE FROM journal_entries WHERE id=ob; END IF;
  UPDATE tenant_settings SET closed_until=s.fiscal_end,
    fiscal_start=s.fiscal_end+1, fiscal_end=(s.fiscal_end + interval '1 year')::date, updated_at=now() WHERE tenant_id=t;
END $$;