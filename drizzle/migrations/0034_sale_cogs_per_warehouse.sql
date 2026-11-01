DO $mig$
DECLARE src text; old text; new text;
BEGIN
  src := pg_get_functiondef('public.post_document_core'::regproc);
  old := $o$IF cost>0 AND s.inventory_method<>'periodic' THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES
        (d.tenant_id,e,s.cogs_account_id,cost,0),(d.tenant_id,e,s.inventory_account_id,0,cost); END IF;$o$;
  new := $n$IF cost>0 AND s.inventory_method<>'periodic' THEN
        -- SALE_COGS_PER_WAREHOUSE_V1: credit each line warehouse's inventory account.
        lv := 0;
        FOR inv IN SELECT coalesce(w.account_id,s.inventory_account_id) acc, round(sum(m.qty*m.unit_cost)*coalesce(nullif(d.exchange_rate,0),1),4) v
          FROM stock_moves m LEFT JOIN warehouses w ON w.id=m.warehouse_id
          WHERE m.document_id=_id AND m.direction='out' GROUP BY 1 LOOP
          IF inv.acc IS NULL THEN RAISE EXCEPTION 'اربط المستودع بحساب مخزون أو حدد حساب المخزون في الربط المحاسبي'; END IF;
          IF inv.v<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES (d.tenant_id,e,inv.acc,0,inv.v); lv := lv + inv.v; END IF;
        END LOOP;
        IF lv<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES (d.tenant_id,e,s.cogs_account_id,lv,0); END IF;
      END IF;$n$;
  IF position(old in src) = 0 THEN RAISE EXCEPTION 'sale COGS block not found'; END IF;
  src := replace(src, old, new);
  EXECUTE src;
END $mig$;