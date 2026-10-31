CREATE OR REPLACE FUNCTION public.restore_tenant_full(_id uuid, _data jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE tbl text; x jsonb; ts jsonb; cols text; ok int; bad int; rep jsonb := '{}'::jsonb; fk record;
BEGIN
  IF NOT (is_super_admin() OR (is_tenant_admin() AND my_tenant_id()=_id)) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  PERFORM public.restore_tenant(_id, _data);
  ts := _data->'tenant_settings'->0;
  IF ts IS NOT NULL THEN
    SELECT string_agg(format('%1$I = r.%1$I', a.attname), ', ') INTO cols
    FROM pg_attribute a WHERE a.attrelid='public.tenant_settings'::regclass AND a.attnum>0 AND NOT a.attisdropped
      AND a.attname NOT IN ('id','tenant_id') AND ts ? a.attname::text
      AND a.attname NOT IN (SELECT at.attname FROM pg_constraint c JOIN pg_attribute at ON at.attrelid=c.conrelid AND at.attnum=any(c.conkey)
                             WHERE c.contype='f' AND c.conrelid='public.tenant_settings'::regclass);
    IF cols IS NOT NULL THEN
      EXECUTE format('UPDATE public.tenant_settings t SET %s FROM jsonb_populate_record(NULL::public.tenant_settings, $1) r WHERE t.tenant_id=$2', cols) USING ts, _id;
    END IF;
  END IF;
  IF is_super_admin() AND _data->'tenants'->0 IS NOT NULL THEN
    UPDATE tenants SET name=coalesce(_data->'tenants'->0->>'name', name), name_en=_data->'tenants'->0->>'name_en' WHERE id=_id;
  END IF;
  FOREACH tbl IN ARRAY ARRAY['tenant_features','units','branches','cost_centers','employees','employee_advances','employee_leaves',
    'employee_adjustments','payroll_runs','recurring_entries','hotel_rooms','hotel_reservations','product_recipes','product_batches',
    'manufacturing_orders','manufacturing_materials','manufacturing_byproducts','batch_consumptions','assembly_vouchers','user_cash_drawers','pos_shifts','record_comments',
    'approval_requests','partner_inquiries','attachments','personal_notes','chat_messages','ai_drafts','user_permissions','tenant_members',
    'doc_patterns','bank_recon_marks','fx_log','service_contracts','service_orders','project_templates','project_wbs','project_bom',
    'project_quotes','project_snags','solar_projects','solar_roles'] LOOP
    IF _data ? tbl AND to_regclass('public.'||tbl) IS NOT NULL THEN
      ok := 0; bad := 0;
      FOR x IN SELECT * FROM jsonb_array_elements(_data->tbl) LOOP
        BEGIN
          EXECUTE format('INSERT INTO public.%1$I SELECT * FROM jsonb_populate_record(NULL::public.%1$I, $1) ON CONFLICT DO NOTHING', tbl)
            USING (public._fill_defaults(tbl, x) || jsonb_build_object('tenant_id', _id));
          ok := ok + 1;
        EXCEPTION WHEN others THEN bad := bad + 1;
        END;
      END LOOP;
      rep := rep || jsonb_build_object(tbl, jsonb_build_array(ok, bad));
    END IF;
  END LOOP;
  -- settings account links (foreign keys) after all referenced rows exist, one column at a time
  IF ts IS NOT NULL THEN
    FOR fk IN SELECT DISTINCT at.attname AS col FROM pg_constraint c JOIN pg_attribute at ON at.attrelid=c.conrelid AND at.attnum=any(c.conkey)
              WHERE c.contype='f' AND c.conrelid='public.tenant_settings'::regclass AND at.attname<>'tenant_id' LOOP
      IF ts ? fk.col::text THEN
        BEGIN
          EXECUTE format('UPDATE public.tenant_settings t SET %1$I = r.%1$I FROM jsonb_populate_record(NULL::public.tenant_settings, $1) r WHERE t.tenant_id=$2', fk.col) USING ts, _id;
        EXCEPTION WHEN others THEN NULL;
        END;
      END IF;
    END LOOP;
  END IF;
  RETURN rep;
END $function$;