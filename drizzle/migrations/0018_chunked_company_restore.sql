
-- Silence notifications while a restore is running
CREATE OR REPLACE FUNCTION public.emit_notification(_tenant uuid, _kind text, _title text, _body text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.notifications(tenant_id, kind, title, body, created_by)
  SELECT _tenant, _kind, _title, _body, auth.uid() WHERE coalesce(current_setting('app.restoring', true),'') <> 'on';
$$;
CREATE OR REPLACE FUNCTION public.emit_notification(_tenant uuid, _kind text, _title text, _body text, _link text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.notifications(tenant_id, kind, title, body, created_by, link)
  SELECT _tenant, _kind, _title, _body, auth.uid(), _link WHERE coalesce(current_setting('app.restoring', true),'') <> 'on';
$$;
CREATE OR REPLACE FUNCTION public.notify_user(_user uuid, _tenant uuid, _title text, _body text, _kind text, _link text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.notifications(user_id, tenant_id, title, body, kind, link)
  SELECT _user, _tenant, _title, _body, _kind, _link WHERE coalesce(current_setting('app.restoring', true),'') <> 'on';
$$;
CREATE OR REPLACE FUNCTION public.notify_tenant_admins(_tenant uuid, _title text, _body text, _kind text, _link text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.notifications(user_id, tenant_id, title, body, kind, link)
  SELECT p.id, _tenant, _title, _body, _kind, _link FROM public.profiles p
  WHERE p.tenant_id = _tenant AND p.is_tenant_admin AND p.is_active AND p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
    AND coalesce(current_setting('app.restoring', true),'') <> 'on';
$$;
CREATE OR REPLACE FUNCTION public.notify_super_admins(_tenant uuid, _title text, _body text, _kind text, _link text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.notifications(user_id, tenant_id, title, body, kind, link)
  SELECT p.id, NULL, _title, _body, _kind, _link FROM public.profiles p
  WHERE p.is_super_admin AND p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
    AND coalesce(current_setting('app.restoring', true),'') <> 'on';
$$;

-- Ordered list of every company table (parents before children) with the nullable links filled in a second pass
CREATE OR REPLACE FUNCTION public.company_backup_plan()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  excluded text[] := ARRAY['tenants','tenant_settings','profiles','audit_log','login_events','notifications','backups'];
  tabs text[]; done text[] := '{}'; res jsonb := '[]'::jsonb; t text; progressed boolean; late text[];
BEGIN
  SELECT array_agg(c.table_name::text ORDER BY c.table_name) INTO tabs
  FROM information_schema.columns c JOIN information_schema.tables x USING (table_schema, table_name)
  WHERE c.table_schema='public' AND c.column_name='tenant_id' AND x.table_type='BASE TABLE' AND NOT (c.table_name::text = ANY(excluded));
  LOOP
    progressed := false;
    FOREACH t IN ARRAY tabs LOOP
      CONTINUE WHEN t = ANY(done);
      -- ready when every required (NOT NULL) link points to an already placed table, itself or a table outside the plan
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=any(k.conkey)
        WHERE k.contype='f' AND k.conrelid=('public.'||t)::regclass AND a.attnotnull AND a.attname<>'tenant_id'
          AND k.confrelid::regclass::text = ANY(tabs) AND k.confrelid::regclass::text <> t
          AND NOT (k.confrelid::regclass::text = ANY(done))
      ) THEN
        done := done || t; progressed := true;
      END IF;
    END LOOP;
    EXIT WHEN NOT progressed;
  END LOOP;
  -- anything left (cycles) goes at the end
  FOREACH t IN ARRAY tabs LOOP
    IF NOT (t = ANY(done)) THEN done := done || t; END IF;
  END LOOP;
  FOREACH t IN ARRAY done LOOP
    late := '{}';
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attname='id' AND NOT attisdropped) THEN
      SELECT coalesce(array_agg(DISTINCT a.attname::text), '{}') INTO late
      FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=any(k.conkey)
      WHERE k.contype='f' AND k.conrelid=('public.'||t)::regclass AND NOT a.attnotnull AND a.attname NOT IN ('tenant_id','branch_id');
    END IF;
    res := res || jsonb_build_array(jsonb_build_object('table', t, 'late', to_jsonb(late)));
  END LOOP;
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public._restore_guard(_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (is_super_admin() OR (is_tenant_admin() AND my_tenant_id()=_id)) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  PERFORM set_config('app.restoring','on',true);
  PERFORM set_config('app.bypass','1',true);
END $$;

-- Step 1: empty the company's data (keeps company record, settings row and users)
CREATE OR REPLACE FUNCTION public.restore_company_begin(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p jsonb; i int; t text; errs jsonb := '[]'::jsonb; col text;
BEGIN
  PERFORM public._restore_guard(_id);
  -- release links from settings to accounts
  FOR col IN SELECT a.attname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=any(c.conkey)
    WHERE c.contype='f' AND c.conrelid='public.tenant_settings'::regclass AND a.attname<>'tenant_id' AND NOT a.attnotnull LOOP
    EXECUTE format('UPDATE public.tenant_settings SET %I=NULL WHERE tenant_id=$1', col) USING _id;
  END LOOP;
  p := public.company_backup_plan();
  -- clear nullable links first so rows can be deleted in any order
  FOR i IN 0..jsonb_array_length(p)-1 LOOP
    t := p->i->>'table';
    FOR col IN SELECT jsonb_array_elements_text(p->i->'late') LOOP
      BEGIN
        EXECUTE format('UPDATE public.%I SET %I=NULL WHERE tenant_id=$1 AND %I IS NOT NULL', t, col, col) USING _id;
      EXCEPTION WHEN others THEN errs := errs || jsonb_build_array(t||'.'||col||': '||SQLERRM);
      END;
    END LOOP;
  END LOOP;
  ALTER TABLE public.stock_moves DISABLE TRIGGER trg_stock_move;
  FOR i IN REVERSE jsonb_array_length(p)-1..0 LOOP
    t := p->i->>'table';
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE tenant_id=$1', t) USING _id;
    EXCEPTION WHEN others THEN errs := errs || jsonb_build_array(t||': '||SQLERRM);
    END;
  END LOOP;
  ALTER TABLE public.stock_moves ENABLE TRIGGER trg_stock_move;
  RETURN jsonb_build_object('errors', errs);
END $$;

-- Step 2: insert one batch of rows (phase 'insert') or fill their late links (phase 'link')
CREATE OR REPLACE FUNCTION public.restore_company_rows(_id uuid, _table text, _rows jsonb, _phase text DEFAULT 'insert')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p jsonb; late text[]; x jsonb; r jsonb; n int; ok int := 0; skipped int := 0; bad int := 0;
  errs jsonb := '[]'::jsonb; sets text; col text;
BEGIN
  PERFORM public._restore_guard(_id);
  p := public.company_backup_plan();
  SELECT array(SELECT jsonb_array_elements_text(e->'late')) INTO late FROM jsonb_array_elements(p) e WHERE e->>'table' = _table;
  IF late IS NULL THEN RAISE EXCEPTION 'جدول غير مدعوم: %', _table; END IF;
  IF _table = 'stock_moves' THEN ALTER TABLE public.stock_moves DISABLE TRIGGER trg_stock_move; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(_rows,'[]'::jsonb)) LOOP
    BEGIN
      IF _phase = 'link' THEN
        sets := NULL;
        FOREACH col IN ARRAY late LOOP
          IF x ? col AND x->col <> 'null'::jsonb THEN
            sets := coalesce(sets || ', ', '') || format('%1$I = r.%1$I', col);
          END IF;
        END LOOP;
        IF sets IS NULL THEN CONTINUE; END IF;
        EXECUTE format('UPDATE public.%1$I t SET %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1) r WHERE t.id = r.id AND t.tenant_id = $2', _table, sets)
          USING x, _id;
        GET DIAGNOSTICS n = ROW_COUNT;
      ELSE
        r := x;
        FOREACH col IN ARRAY late LOOP r := r - col; END LOOP;
        r := public._fill_defaults(_table, r) || jsonb_build_object('tenant_id', _id);
        EXECUTE format('INSERT INTO public.%1$I SELECT * FROM jsonb_populate_record(NULL::public.%1$I, $1) ON CONFLICT DO NOTHING', _table) USING r;
        GET DIAGNOSTICS n = ROW_COUNT;
      END IF;
      IF n > 0 THEN ok := ok + 1; ELSE skipped := skipped + 1; END IF;
    EXCEPTION WHEN others THEN
      bad := bad + 1;
      IF jsonb_array_length(errs) < 5 THEN errs := errs || jsonb_build_array(SQLERRM); END IF;
    END;
  END LOOP;
  IF _table = 'stock_moves' THEN ALTER TABLE public.stock_moves ENABLE TRIGGER trg_stock_move; END IF;
  RETURN jsonb_build_object('ok', ok, 'skipped', skipped, 'bad', bad, 'errors', errs);
END $$;

-- Step 3: company settings and (owner only) company record
CREATE OR REPLACE FUNCTION public.restore_company_finish(_id uuid, _settings jsonb, _tenant jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE col text; errs jsonb := '[]'::jsonb; cols text;
BEGIN
  PERFORM public._restore_guard(_id);
  IF _settings IS NOT NULL AND jsonb_typeof(_settings)='object' THEN
    INSERT INTO public.tenant_settings(tenant_id) SELECT _id WHERE NOT EXISTS (SELECT 1 FROM public.tenant_settings WHERE tenant_id=_id);
    FOR col IN SELECT a.attname FROM pg_attribute a WHERE a.attrelid='public.tenant_settings'::regclass AND a.attnum>0 AND NOT a.attisdropped
      AND a.attname NOT IN ('id','tenant_id') AND _settings ? a.attname::text LOOP
      BEGIN
        EXECUTE format('UPDATE public.tenant_settings t SET %1$I = r.%1$I FROM jsonb_populate_record(NULL::public.tenant_settings, $1) r WHERE t.tenant_id=$2', col)
          USING _settings, _id;
      EXCEPTION WHEN others THEN errs := errs || jsonb_build_array('tenant_settings.'||col||': '||SQLERRM);
      END;
    END LOOP;
  END IF;
  IF is_super_admin() AND _tenant IS NOT NULL AND jsonb_typeof(_tenant)='object' THEN
    SELECT string_agg(format('%1$I = r.%1$I', a.attname), ', ') INTO cols
    FROM pg_attribute a WHERE a.attrelid='public.tenants'::regclass AND a.attnum>0 AND NOT a.attisdropped
      AND a.attname NOT IN ('id','created_at') AND _tenant ? a.attname::text;
    IF cols IS NOT NULL THEN
      BEGIN
        EXECUTE format('UPDATE public.tenants t SET %s FROM jsonb_populate_record(NULL::public.tenants, $1) r WHERE t.id=$2', cols) USING _tenant, _id;
      EXCEPTION WHEN others THEN errs := errs || jsonb_build_array('tenants: '||SQLERRM);
      END;
    END IF;
  END IF;
  RETURN jsonb_build_object('errors', errs);
END $$;

GRANT EXECUTE ON FUNCTION public.company_backup_plan() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_company_begin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_company_rows(uuid, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_company_finish(uuid, jsonb, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._restore_guard(uuid) FROM anon;
