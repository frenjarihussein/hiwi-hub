CREATE OR REPLACE FUNCTION public.currency_delete_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF coalesce(current_setting('app.bypass', true),'') = '1' OR coalesce(current_setting('app.restoring', true),'') = 'on' THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM accounts WHERE tenant_id = OLD.tenant_id AND currency::text = OLD.code)
  OR EXISTS (SELECT 1 FROM journal_entries WHERE tenant_id = OLD.tenant_id AND currency::text = OLD.code)
  OR EXISTS (SELECT 1 FROM documents WHERE tenant_id = OLD.tenant_id AND currency::text = OLD.code)
  OR EXISTS (SELECT 1 FROM partners WHERE tenant_id = OLD.tenant_id AND currency::text = OLD.code)
  OR EXISTS (SELECT 1 FROM exchange_rates WHERE tenant_id = OLD.tenant_id AND currency::text = OLD.code) THEN
    RAISE EXCEPTION 'لا يمكن حذف عملة مستخدمة، يمكنك إيقافها بدلاً من ذلك';
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.purge_tenant(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '120s' AS $$
DECLARE plan jsonb; t jsonb; c text; r record; i int; pass int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_super_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  PERFORM set_config('app.bypass','1',true);
  PERFORM set_config('app.restoring','on',true);
  plan := company_backup_plan();
  -- null nullable FK links first
  FOR t IN SELECT * FROM jsonb_array_elements(plan) LOOP
    FOR c IN SELECT jsonb_array_elements_text(coalesce(t->'late','[]'::jsonb)) LOOP
      BEGIN
        EXECUTE format('UPDATE public.%I SET %I = NULL WHERE tenant_id = $1 AND %I IS NOT NULL', t->>'table', c, c) USING _id;
      EXCEPTION WHEN others THEN NULL; END;
    END LOOP;
  END LOOP;
  BEGIN UPDATE tenant_settings SET cash_account_id=NULL,customers_account_id=NULL,suppliers_account_id=NULL,inventory_account_id=NULL,
    sales_account_id=NULL,cogs_account_id=NULL,project_cost_account_id=NULL,fx_account_id=NULL,retained_earnings_account_id=NULL,
    salaries_account_id=NULL,advances_account_id=NULL,inventory_adjust_account_id=NULL WHERE tenant_id=_id;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM tenant_settings WHERE tenant_id=_id; EXCEPTION WHEN others THEN NULL; END;
  ALTER TABLE stock_moves DISABLE TRIGGER trg_stock_move;
  -- delete children first, two passes to survive ordering surprises
  FOR pass IN 1..2 LOOP
    FOR i IN REVERSE jsonb_array_length(plan)-1..0 LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', plan->i->>'table') USING _id;
      EXCEPTION WHEN others THEN NULL; END;
    END LOOP;
  END LOOP;
  ALTER TABLE stock_moves ENABLE TRIGGER trg_stock_move;
  -- any remaining tenant-scoped tables
  FOR r IN SELECT c2.table_name FROM information_schema.columns c2 JOIN information_schema.tables tb
      ON tb.table_schema=c2.table_schema AND tb.table_name=c2.table_name AND tb.table_type='BASE TABLE'
    WHERE c2.table_schema='public' AND c2.column_name='tenant_id' AND c2.table_name NOT IN ('profiles','tenants') LOOP
    BEGIN EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', r.table_name) USING _id;
    EXCEPTION WHEN others THEN NULL; END;
  END LOOP;
  UPDATE profiles SET tenant_id=NULL WHERE tenant_id=_id;
  BEGIN UPDATE profiles SET active_tenant_id=NULL WHERE active_tenant_id=_id; EXCEPTION WHEN others THEN NULL; END;
  DELETE FROM tenants WHERE id=_id;
END $$;