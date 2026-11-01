-- نسخة نظيفة v2: شغّلها على مشروع فارغ
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
CREATE SCHEMA IF NOT EXISTS public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- هيكل قاعدة البيانات الكامل (بدون بيانات) — شغّله مرة واحدة في SQL Editor لمشروع جديد فارغ
-- 2026-11-01
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: account_nature; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_nature AS ENUM (
    'closing',
    'balance_sheet',
    'profit_loss',
    'assets',
    'liabilities',
    'equity',
    'revenues',
    'expenses',
    'cost_centers'
);


--
-- Name: currency_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.currency_code AS ENUM (
    'USD',
    'SYP',
    'TRY',
    'EUR',
    'SAR',
    'AED',
    'JOD',
    'GBP',
    'EGP',
    'LIR',
    'ZZZ'
);


--
-- Name: perm_action; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.perm_action AS ENUM (
    'view',
    'create',
    'edit',
    'delete'
);


--
-- Name: probe_xyz; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.probe_xyz AS ENUM (
    'a'
);


--
-- Name: _fill_defaults(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public._fill_defaults(_t text, _row jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE r record; v jsonb; res jsonb := '{}'::jsonb;
BEGIN
  FOR r IN SELECT column_name, column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name=_t AND is_nullable='NO' AND column_default IS NOT NULL LOOP
    IF NOT (_row ? r.column_name) OR _row->r.column_name = 'null'::jsonb THEN
      EXECUTE 'SELECT to_jsonb(' || r.column_default || ')' INTO v;
      res := res || jsonb_build_object(r.column_name, v);
    END IF;
  END LOOP;
  RETURN (SELECT coalesce(jsonb_object_agg(k, val), '{}'::jsonb) FROM jsonb_each(_row) AS e(k, val) WHERE val <> 'null'::jsonb) || res;
END $$;


--
-- Name: _remap_row(jsonb, uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public._remap_row(j jsonb, _t uuid, _defer text[]) RETURNS jsonb
    LANGUAGE plpgsql
    AS $_$
DECLARE k text; v jsonb; nv uuid; r jsonb := j;
BEGIN
  FOR k, v IN SELECT * FROM jsonb_each(j) LOOP
    IF k = 'tenant_id' THEN r := r || jsonb_build_object(k, _t);
    ELSIF k = ANY(_defer) THEN r := r || jsonb_build_object(k, null);
    ELSIF jsonb_typeof(v) = 'string' AND (v #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT m.new INTO nv FROM _clone_map m WHERE m.old = (v #>> '{}')::uuid;
      IF nv IS NOT NULL THEN r := r || jsonb_build_object(k, nv);
      ELSIF k <> 'id' THEN r := r || jsonb_build_object(k, null);
      END IF;
    END IF;
  END LOOP;
  RETURN r;
END $_$;


--
-- Name: _restore_guard(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public._restore_guard(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (is_super_admin() OR (is_tenant_admin() AND my_tenant_id()=_id)) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  PERFORM set_config('app.restoring','on',true);
  PERFORM set_config('app.bypass','1',true);
END $$;


--
-- Name: _restore_remap(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public._restore_remap(_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
DECLARE res jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _idmap(o text PRIMARY KEY, n text) ON COMMIT DROP;
  DELETE FROM _idmap WHERE true;
  INSERT INTO _idmap SELECT DISTINCT r->>'id', gen_random_uuid()::text
    FROM jsonb_each(_data) d(t,v), jsonb_array_elements(CASE WHEN jsonb_typeof(d.v)='array' THEN d.v ELSE '[]'::jsonb END) r
    WHERE d.t <> 'tenant_settings' AND jsonb_typeof(r)='object' AND (r->>'id') ~* '^[0-9a-f-]{36}$'
    ON CONFLICT DO NOTHING;
  SELECT jsonb_object_agg(d.t, CASE WHEN d.t='tenant_settings' OR jsonb_typeof(d.v)<>'array' THEN public._restore_remap_val(d.v) ELSE
    (SELECT coalesce(jsonb_agg((SELECT coalesce(jsonb_object_agg(e.key, public._restore_remap_val(e.value)),'{}'::jsonb) FROM jsonb_each(r) e)),'[]'::jsonb)
     FROM jsonb_array_elements(d.v) r) END)
  INTO res FROM jsonb_each(_data) d(t,v);
  RETURN coalesce(res,'{}'::jsonb);
END $_$;


--
-- Name: _restore_remap_val(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public._restore_remap_val(v jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE txt text; m text; nn text;
BEGIN
  IF v IS NULL THEN RETURN v; END IF;
  IF jsonb_typeof(v)='string' THEN
    SELECT n INTO nn FROM _idmap WHERE o = v#>>'{}';
    RETURN CASE WHEN nn IS NULL THEN v ELSE to_jsonb(nn) END;
  ELSIF jsonb_typeof(v) IN ('object','array') THEN
    txt := v::text;
    FOR m IN SELECT DISTINCT (regexp_matches(txt, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', 'g'))[1] LOOP
      SELECT n INTO nn FROM _idmap WHERE o = m;
      IF nn IS NOT NULL THEN txt := replace(txt, m, nn); END IF;
    END LOOP;
    RETURN txt::jsonb;
  END IF;
  RETURN v;
END $$;


--
-- Name: account_subtree_recode(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.account_subtree_recode() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$ DECLARE old_prefix text; new_prefix text; BEGIN
 IF pg_trigger_depth()>1 OR current_setting('app.restoring',true)='on' OR current_setting('app.bypass',true)='1' THEN RETURN NEW; END IF;
 IF NEW.parent_id IS DISTINCT FROM OLD.parent_id AND NEW.parent_id IS NOT NULL THEN
  IF EXISTS(WITH RECURSIVE subtree AS (SELECT id FROM public.accounts WHERE id=OLD.id UNION ALL SELECT a.id FROM public.accounts a JOIN subtree s ON a.parent_id=s.id) SELECT 1 FROM subtree WHERE id=NEW.parent_id) THEN RAISE EXCEPTION 'لا يمكن نقل الحساب تحت أحد فروعه'; END IF;
  SELECT code INTO new_prefix FROM public.accounts WHERE id=NEW.parent_id AND tenant_id=NEW.tenant_id AND is_group;
  IF new_prefix IS NULL THEN RAISE EXCEPTION 'اختر حساباً تجميعياً من الشركة نفسها'; END IF;
  IF NEW.code=OLD.code OR left(NEW.code,length(new_prefix))<>new_prefix THEN RAISE EXCEPTION 'حدد رمزاً جديداً يبدأ برمز الأب الجديد'; END IF;
 END IF;
 IF NEW.code IS DISTINCT FROM OLD.code THEN
  old_prefix:=OLD.code; new_prefix:=NEW.code;
 IF EXISTS(WITH RECURSIVE subtree AS (SELECT id,code FROM public.accounts WHERE parent_id=OLD.id UNION ALL SELECT a.id,a.code FROM public.accounts a JOIN subtree s ON a.parent_id=s.id) SELECT 1 FROM subtree WHERE left(code,length(old_prefix))<>old_prefix) THEN RAISE EXCEPTION 'رموز الفروع لا تتبع رمز الأب؛ صححها قبل نقل الحساب'; END IF;
  IF EXISTS(WITH RECURSIVE subtree AS (SELECT id,code FROM public.accounts WHERE parent_id=OLD.id UNION ALL SELECT a.id,a.code FROM public.accounts a JOIN subtree s ON a.parent_id=s.id) SELECT 1 FROM subtree s JOIN public.accounts a ON a.tenant_id=NEW.tenant_id AND a.code=new_prefix||substring(s.code FROM length(old_prefix)+1) WHERE a.id<>s.id) THEN RAISE EXCEPTION 'الترقيم الجديد يتعارض مع حساب موجود'; END IF;
  UPDATE public.accounts SET code=new_prefix||substring(code FROM length(old_prefix)+1) WHERE id IN (WITH RECURSIVE subtree AS (SELECT id FROM public.accounts WHERE parent_id=OLD.id UNION ALL SELECT a.id FROM public.accounts a JOIN subtree s ON a.parent_id=s.id) SELECT id FROM subtree) AND left(code,length(old_prefix))=old_prefix;
 END IF;
 RETURN NEW; END $$;


--
-- Name: add_currency(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.add_currency(_code text, _name text, _symbol text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE c text := upper(trim(_code));
BEGIN
  IF my_tenant_id() IS NULL OR NOT is_tenant_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF c !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'رمز العملة يجب أن يكون 3 أحرف إنجليزية مثل EUR'; END IF;
  IF coalesce(trim(_name),'')='' THEN RAISE EXCEPTION 'أدخل اسم العملة'; END IF;
  EXECUTE format('ALTER TYPE public.currency_code ADD VALUE IF NOT EXISTS %L', c);
  IF EXISTS (SELECT 1 FROM currencies WHERE tenant_id=my_tenant_id() AND code=c) THEN
    UPDATE currencies SET name=_name, symbol=nullif(_symbol,'') WHERE tenant_id=my_tenant_id() AND code=c;
  ELSE
    INSERT INTO currencies(tenant_id,code,name,symbol) VALUES (my_tenant_id(), c, _name, nullif(_symbol,''));
  END IF;
END $_$;


--
-- Name: apply_stock_move(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.apply_stock_move() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE p record; wq numeric;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    UPDATE products SET qty_on_hand = qty_on_hand - CASE WHEN OLD.direction='in' THEN OLD.qty ELSE -OLD.qty END WHERE id=OLD.product_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT * INTO p FROM products WHERE id=NEW.product_id FOR UPDATE;
    IF NEW.direction='out' THEN
      SELECT coalesce(sum(CASE WHEN direction='in' THEN qty ELSE -qty END),0) INTO wq FROM stock_moves
        WHERE product_id=NEW.product_id AND warehouse_id=NEW.warehouse_id AND id<>NEW.id;
      IF wq < NEW.qty THEN RAISE EXCEPTION 'الكمية غير متوفرة في المستودع (المتوفر %)', wq; END IF;
      IF coalesce(NEW.unit_cost,0)=0 THEN NEW.unit_cost := p.avg_cost; END IF;
      UPDATE products SET qty_on_hand = qty_on_hand - NEW.qty WHERE id=NEW.product_id;
    ELSE
      UPDATE products SET
        avg_cost = CASE WHEN greatest(p.qty_on_hand,0) + NEW.qty > 0 THEN (greatest(p.qty_on_hand,0)*p.avg_cost + NEW.qty*NEW.unit_cost)/(greatest(p.qty_on_hand,0)+NEW.qty) ELSE NEW.unit_cost END,
        last_purchase_price = CASE WHEN NEW.unit_cost>0 AND coalesce(NEW.reference,'') NOT IN ('sale_return','transfer') THEN NEW.unit_cost ELSE last_purchase_price END,
        qty_on_hand = qty_on_hand + NEW.qty WHERE id=NEW.product_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;


--
-- Name: approval_request_after(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.approval_request_after() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.notify_tenant_admins(NEW.tenant_id, 'طلب اعتماد: ' || NEW.title, NEW.note, 'approval', '/approvals');
  RETURN NEW;
END $$;


--
-- Name: attach_module(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.attach_module(_t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$ SELECT CASE WHEN _t = 'document' THEN 'documents' WHEN _t = 'project' THEN 'projects' ELSE 'journal' END $$;


--
-- Name: audit_row(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.audit_row() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r jsonb; t uuid;
BEGIN
  IF current_setting('app.restoring', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN r := to_jsonb(OLD); ELSE r := to_jsonb(NEW); END IF;
  BEGIN t := (r->>'tenant_id')::uuid; EXCEPTION WHEN others THEN t := NULL; END;
  IF TG_TABLE_NAME = 'tenants' THEN t := (r->>'id')::uuid; END IF;
  INSERT INTO public.audit_log (tenant_id, user_id, table_name, record_id, action, old_data, new_data)
  VALUES (t, auth.uid(), TG_TABLE_NAME, r->>'id', TG_OP,
          CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;


--
-- Name: base_currency_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.base_currency_lock() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF coalesce(OLD.onboarding_done,false) AND NEW.base_currency IS DISTINCT FROM OLD.base_currency THEN
    RAISE EXCEPTION 'لا يمكن تغيير عملة الشركة بعد انتهاء الإعداد الأول';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: batches_on_move_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.batches_on_move_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_setting('app.restoring', true) = 'on' OR current_setting('app.bypass', true) = '1' THEN RETURN OLD; END IF;
  UPDATE product_batches b SET qty_remaining = qty_remaining + c.qty
    FROM batch_consumptions c WHERE c.batch_id = b.id AND c.move_id = OLD.id;
  DELETE FROM batch_consumptions WHERE move_id = OLD.id;
  IF OLD.direction = 'in' AND OLD.reference IN ('purchase','stock_in') THEN
    DELETE FROM batch_consumptions WHERE batch_id IN (
      SELECT id FROM product_batches WHERE document_id = OLD.document_id AND product_id = OLD.product_id AND warehouse_id = OLD.warehouse_id);
    DELETE FROM product_batches WHERE document_id = OLD.document_id AND product_id = OLD.product_id AND warehouse_id = OLD.warehouse_id;
  END IF;
  RETURN OLD;
END $$;


--
-- Name: batches_on_stock_in(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.batches_on_stock_in() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE exp date;
BEGIN
  IF current_setting('app.restoring', true) = 'on' OR current_setting('app.bypass', true) = '1' THEN RETURN NEW; END IF;
  IF NEW.direction <> 'in' OR NEW.reference NOT IN ('purchase','stock_in','opening_inventory') THEN RETURN NEW; END IF;
  SELECT expiry_date INTO exp FROM document_lines
    WHERE document_id = NEW.document_id AND product_id = NEW.product_id AND expiry_date IS NOT NULL
    ORDER BY expiry_date ASC LIMIT 1;
  INSERT INTO product_batches(tenant_id, product_id, warehouse_id, batch_no, expiry_date, qty_remaining, unit_cost, document_id)
  VALUES (NEW.tenant_id, NEW.product_id, NEW.warehouse_id,
          'B-' || to_char(coalesce(NEW.move_date, current_date), 'YYMMDD') || '-' || upper(substr(replace(NEW.id::text,'-',''),1,6)),
          exp, NEW.qty, NEW.unit_cost, NEW.document_id);
  RETURN NEW;
END $$;


--
-- Name: batches_on_stock_out(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.batches_on_stock_out() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE need numeric; take numeric; b record;
BEGIN
  IF current_setting('app.restoring', true) = 'on' OR current_setting('app.bypass', true) = '1' THEN RETURN NEW; END IF;
  IF NEW.direction <> 'out' THEN RETURN NEW; END IF;
  need := NEW.qty;
  FOR b IN SELECT id, qty_remaining FROM product_batches
           WHERE tenant_id = NEW.tenant_id AND product_id = NEW.product_id AND warehouse_id = NEW.warehouse_id AND qty_remaining > 0
           ORDER BY (expiry_date IS NULL) DESC, expiry_date ASC, created_at ASC
           FOR UPDATE LOOP
    EXIT WHEN need <= 0;
    take := least(b.qty_remaining, need);
    UPDATE product_batches SET qty_remaining = qty_remaining - take WHERE id = b.id;
    INSERT INTO batch_consumptions(tenant_id, batch_id, move_id, qty) VALUES (NEW.tenant_id, b.id, NEW.id, take);
    need := need - take;
  END LOOP;
  RETURN NEW;
END $$;


--
-- Name: block_delete_with_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.block_delete_with_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE n bigint := 0;
BEGIN
  IF TG_TABLE_NAME = 'accounts' THEN
    SELECT count(*) INTO n FROM public.journal_lines WHERE account_id = OLD.id;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.documents WHERE account_id = OLD.id; END IF;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.accounts WHERE parent_id = OLD.id; END IF;
  ELSIF TG_TABLE_NAME = 'products' THEN
    SELECT count(*) INTO n FROM public.stock_moves WHERE product_id = OLD.id;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.document_lines WHERE product_id = OLD.id; END IF;
  ELSIF TG_TABLE_NAME = 'partners' THEN
    SELECT count(*) INTO n FROM public.journal_lines WHERE partner_id = OLD.id;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.stock_moves WHERE partner_id = OLD.id; END IF;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.documents WHERE partner_id = OLD.id; END IF;
  ELSIF TG_TABLE_NAME = 'projects' THEN
    SELECT count(*) INTO n FROM public.journal_lines WHERE project_id = OLD.id;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.stock_moves WHERE project_id = OLD.id; END IF;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.documents WHERE project_id = OLD.id; END IF;
  ELSIF TG_TABLE_NAME = 'warehouses' THEN
    SELECT count(*) INTO n FROM public.stock_moves WHERE warehouse_id = OLD.id;
    IF n = 0 THEN SELECT count(*) INTO n FROM public.documents WHERE warehouse_id = OLD.id OR to_warehouse_id = OLD.id; END IF;
  END IF;
  IF n > 0 THEN
    RAISE EXCEPTION 'لا يمكن حذف هذه البطاقة لوجود حركات تاريخية مرتبطة بها (%). يمكنك إلغاء تفعيلها بدلاً من الحذف.', n;
  END IF;
  RETURN OLD;
END $$;


--
-- Name: block_nonposting_docs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.block_nonposting_docs() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status='posted' AND NEW.doc_type IN ('purchase_request','purchase_order','payment_order') THEN
    RAISE EXCEPTION 'هذا المستند لا يُرحّل ولا يولّد قيداً';
  END IF;
  IF NEW.status='posted' AND NEW.doc_type='stocktake'
     AND NOT (TG_OP='UPDATE' AND OLD.status='posted')
     AND current_setting('app.stocktake', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'يُعتمد مستند الجرد المخزني من شاشة الجرد فقط';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: branch_default(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.branch_default() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'journal_lines' THEN
    SELECT branch_id INTO NEW.branch_id FROM journal_entries WHERE id = NEW.entry_id;
  ELSIF TG_TABLE_NAME IN ('journal_entries','stock_moves') THEN
    IF NEW.document_id IS NOT NULL THEN
      SELECT branch_id INTO NEW.branch_id FROM documents WHERE id = NEW.document_id;
    END IF;
  END IF;
  IF NEW.branch_id IS NULL AND NEW.tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
     AND EXISTS (SELECT 1 FROM tenant_settings WHERE tenant_id = NEW.tenant_id AND has_branches) THEN
    NEW.branch_id := public.my_branch_scope();
  END IF;
  RETURN NEW;
END $$;


--
-- Name: can_see_branch(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.can_see_branch(_b uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT _b IS NULL OR auth.uid() IS NULL OR public.my_branch_scope() IS NULL OR _b = public.my_branch_scope()
$$;


--
-- Name: category_tree_safety(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.category_tree_safety() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE p record; subs boolean; items boolean; cyc boolean;
BEGIN
 IF current_setting('app.bypass', true) = '1' THEN RETURN NEW; END IF;
 IF NEW.parent_id IS NOT NULL THEN
  EXECUTE format('SELECT id,tenant_id,is_group FROM public.%I WHERE id=$1',TG_TABLE_NAME) INTO p USING NEW.parent_id;
  IF p.id IS NULL OR p.tenant_id<>NEW.tenant_id OR NOT p.is_group THEN RAISE EXCEPTION 'اختر تصنيفاً من الشركة نفسها'; END IF;
  EXECUTE format('WITH RECURSIVE up AS (SELECT id,parent_id FROM public.%I WHERE id=$1 UNION SELECT t.id,t.parent_id FROM public.%I t JOIN up ON t.id=up.parent_id) SELECT EXISTS(SELECT 1 FROM up WHERE id=$2)',TG_TABLE_NAME,TG_TABLE_NAME) INTO cyc USING NEW.parent_id,NEW.id;
  IF cyc THEN RAISE EXCEPTION 'لا يمكن إنشاء حلقة في التصنيفات'; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE parent_id=$1 AND is_group AND id<>$2), EXISTS(SELECT 1 FROM public.%I WHERE parent_id=$1 AND NOT is_group AND id<>$2)',TG_TABLE_NAME,TG_TABLE_NAME) INTO subs,items USING NEW.parent_id,NEW.id;
  IF NOT NEW.is_group AND subs THEN RAISE EXCEPTION 'اختر آخر تصنيف في الشجرة'; END IF;
  IF NEW.is_group AND items THEN RAISE EXCEPTION 'انقل البطاقات قبل إضافة تصنيف فرعي'; END IF;
 ELSIF TG_TABLE_NAME='products' AND NOT NEW.is_group THEN
  IF TG_OP='INSERT' THEN RAISE EXCEPTION 'اختر التصنيف النهائي للمادة'; END IF;
  IF OLD.parent_id IS NOT NULL THEN RAISE EXCEPTION 'اختر التصنيف النهائي للمادة'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.is_group AND NOT NEW.is_group THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE parent_id=$1)',TG_TABLE_NAME) INTO items USING NEW.id;
   IF items THEN RAISE EXCEPTION 'التصنيف يحتوي فروعاً'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $_$;


--
-- Name: check_entry_balanced(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.check_entry_balanced() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE eid uuid; d numeric; c numeric;
BEGIN
  IF current_setting('app.restoring', true) = 'on' THEN RETURN NULL; END IF;
  eid := COALESCE(NEW.entry_id, OLD.entry_id);
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = eid) THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c FROM public.journal_lines WHERE entry_id = eid;
  IF d <> c THEN
    RAISE EXCEPTION 'القيد غير متوازن: مجموع المدين % لا يساوي مجموع الدائن %', d, c;
  END IF;
  RETURN NULL;
END $$;


--
-- Name: claim_operating_device(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.claim_operating_device(_device text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _t uuid := public.current_tenant_id(); _m text; _b text;
BEGIN
  IF _t IS NULL OR coalesce(_device,'') = '' THEN RETURN true; END IF;
  SELECT operating_mode, bound_device_id INTO _m, _b FROM tenant_settings WHERE tenant_id = _t;
  IF coalesce(_m,'multi_device') <> 'single_device' THEN RETURN true; END IF;
  IF _b IS NULL THEN UPDATE tenant_settings SET bound_device_id = _device WHERE tenant_id = _t; RETURN true; END IF;
  RETURN _b = _device;
END $$;


--
-- Name: claim_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.claim_super_admin() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT false $$;


--
-- Name: cleanup_generated_entity_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.cleanup_generated_entity_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
 IF OLD.account_id IS NULL THEN RETURN OLD; END IF;
 IF EXISTS(SELECT 1 FROM public.partners WHERE account_id=OLD.account_id) OR EXISTS(SELECT 1 FROM public.warehouses WHERE account_id=OLD.account_id) OR EXISTS(SELECT 1 FROM public.cost_centers WHERE account_id=OLD.account_id) OR EXISTS(SELECT 1 FROM public.projects WHERE account_id=OLD.account_id) THEN RETURN OLD; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=OLD.account_id AND tenant_id=OLD.tenant_id AND entity_generated) THEN RETURN OLD; END IF;
 IF EXISTS(SELECT 1 FROM public.accounts WHERE parent_id=OLD.account_id) OR EXISTS(SELECT 1 FROM public.journal_lines WHERE account_id=OLD.account_id) THEN RETURN OLD; END IF;
 DELETE FROM public.accounts WHERE id=OLD.account_id AND tenant_id=OLD.tenant_id AND entity_generated;
 RETURN OLD;
END $$;


--
-- Name: clear_must_change_password(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.clear_must_change_password() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.profiles SET must_change_password=false WHERE id=auth.uid();
$$;


--
-- Name: clear_tenant_data(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.clear_tenant_data(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM set_config('app.bypass','1',true);
  UPDATE tenant_settings SET cash_account_id=NULL,customers_account_id=NULL,suppliers_account_id=NULL,inventory_account_id=NULL,
    sales_account_id=NULL,cogs_account_id=NULL,project_cost_account_id=NULL,fx_account_id=NULL,retained_earnings_account_id=NULL,
    salaries_account_id=NULL,advances_account_id=NULL,inventory_adjust_account_id=NULL,closed_until=NULL WHERE tenant_id=_id;
  UPDATE documents SET journal_entry_id=NULL, settles_document_id=NULL WHERE tenant_id=_id;
  UPDATE journal_entries SET document_id=NULL WHERE tenant_id=_id;
  ALTER TABLE stock_moves DISABLE TRIGGER trg_stock_move;
  DELETE FROM stock_moves WHERE tenant_id=_id;
  ALTER TABLE stock_moves ENABLE TRIGGER trg_stock_move;
  DELETE FROM document_lines WHERE tenant_id=_id;
  DELETE FROM journal_lines WHERE tenant_id=_id;
  DELETE FROM journal_entries WHERE tenant_id=_id;
  DELETE FROM documents WHERE tenant_id=_id;
  DELETE FROM cheques WHERE tenant_id=_id;
  DELETE FROM project_expenses WHERE tenant_id=_id;
  DELETE FROM project_milestones WHERE tenant_id=_id;
  DELETE FROM boq_items WHERE tenant_id=_id;
  DELETE FROM projects WHERE tenant_id=_id;
  DELETE FROM products WHERE tenant_id=_id;
  DELETE FROM warehouses WHERE tenant_id=_id;
  DELETE FROM banks WHERE tenant_id=_id;
  DELETE FROM fixed_assets WHERE tenant_id=_id;
  DELETE FROM partners WHERE tenant_id=_id;
  DELETE FROM exchange_rates WHERE tenant_id=_id;
  DELETE FROM currencies WHERE tenant_id=_id;
  UPDATE accounts SET parent_id=NULL WHERE tenant_id=_id;
  DELETE FROM accounts WHERE tenant_id=_id;
END $$;


--
-- Name: clone_tenant(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.clone_tenant(_name text, _label text, _opts jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE src uuid := current_tenant_id(); st record; nt uuid; tb text; d text; e uuid; asof date; s record;
  tables text[] := ARRAY['branches','currencies','units','accounts','warehouses','cost_centers','partners','products'];
  defer jsonb := '{"accounts":["parent_id","closing_account_id"],"warehouses":["parent_id"],"cost_centers":["parent_id"],"partners":["parent_id"],"products":["parent_id"]}';
  cols text[];
BEGIN
  IF src IS NULL OR NOT (is_tenant_admin() OR is_super_admin()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO st FROM tenants WHERE id = src;
  INSERT INTO tenants(name, code, phone, address, is_active, plan, sub_start, sub_end, max_users, notes, subscription_fee, name_en, source_tenant_id, fiscal_label)
    VALUES (_name, NULL, st.phone, st.address, true, st.plan, current_date, st.sub_end, st.max_users, NULL, st.subscription_fee, st.name_en, src, _label)
    RETURNING id INTO nt;
  CREATE TEMP TABLE IF NOT EXISTS _clone_map(old uuid PRIMARY KEY, new uuid NOT NULL) ON COMMIT DROP;
  DELETE FROM _clone_map;
  PERFORM set_config('app.bypass','1',true);
  FOREACH tb IN ARRAY tables LOOP
    IF NOT coalesce((_opts->>tb)::boolean, false) OR to_regclass('public.'||tb) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('INSERT INTO _clone_map SELECT id, gen_random_uuid() FROM public.%I WHERE tenant_id = $1', tb) USING src;
  END LOOP;
  FOREACH tb IN ARRAY tables LOOP
    IF NOT coalesce((_opts->>tb)::boolean, false) OR to_regclass('public.'||tb) IS NULL THEN CONTINUE; END IF;
    cols := ARRAY(SELECT jsonb_array_elements_text(coalesce(defer->tb,'[]')));
    EXECUTE format('INSERT INTO public.%1$I SELECT (jsonb_populate_record(null::public.%1$I, public._remap_row(to_jsonb(x), $1, $2))).* FROM public.%1$I x WHERE x.tenant_id = $3', tb)
      USING nt, cols, src;
    FOREACH d IN ARRAY cols LOOP
      EXECUTE format('UPDATE public.%1$I n SET %2$I = m2.new FROM _clone_map m1 JOIN public.%1$I o ON o.id = m1.old JOIN _clone_map m2 ON m2.old = o.%2$I WHERE n.id = m1.new', tb, d);
    END LOOP;
  END LOOP;
  IF coalesce((_opts->>'products')::boolean,false) THEN
    UPDATE products SET qty_on_hand = 0 WHERE tenant_id = nt;
  END IF;
  -- settings (account links) and features
  INSERT INTO tenant_settings SELECT (jsonb_populate_record(null::tenant_settings, public._remap_row(to_jsonb(x), nt, ARRAY[]::text[]))).* FROM tenant_settings x WHERE x.tenant_id = src;
  UPDATE tenant_settings SET onboarding_done = true, closed_until = NULL, last_backup_at = NULL,
    fiscal_start = coalesce((_opts->>'fiscal_start')::date, fiscal_start), fiscal_end = coalesce((_opts->>'fiscal_end')::date, fiscal_end),
    has_branches = has_branches AND coalesce((_opts->>'branches')::boolean,false)
    WHERE tenant_id = nt;
  INSERT INTO tenant_features(tenant_id, module, enabled) SELECT nt, module, enabled FROM tenant_features WHERE tenant_id = src;
  -- members
  INSERT INTO tenant_members(user_id, tenant_id, is_tenant_admin, is_auditor, account_kind)
    VALUES (auth.uid(), nt, true, false, 'standard') ON CONFLICT DO NOTHING;
  IF coalesce((_opts->>'users')::boolean,false) THEN
    INSERT INTO tenant_members(user_id, tenant_id, is_tenant_admin, is_auditor, account_kind)
      SELECT user_id, nt, is_tenant_admin, is_auditor, account_kind FROM tenant_members WHERE tenant_id = src ON CONFLICT DO NOTHING;
  END IF;
  SELECT * INTO s FROM tenant_settings WHERE tenant_id = src;
  asof := coalesce((_opts->>'as_of')::date, s.fiscal_end, current_date);
  IF coalesce((_opts->>'opening_balances')::boolean,false) AND coalesce((_opts->>'accounts')::boolean,false) THEN
    INSERT INTO journal_entries(tenant_id, entry_no, entry_date, description, currency, exchange_rate, doc_type, created_by)
      VALUES (nt, 1, coalesce((_opts->>'fiscal_start')::date, asof + 1), 'قيد افتتاحي - أرصدة منقولة', coalesce(s.base_currency,'USD')::currency_code, 1, 'opening', auth.uid())
      RETURNING id INTO e;
    INSERT INTO journal_lines(tenant_id, entry_id, account_id, partner_id, debit, credit)
      SELECT nt, e, ma.new, mp.new, greatest(sum(l.debit-l.credit),0), greatest(sum(l.credit-l.debit),0)
      FROM journal_lines l JOIN journal_entries j ON j.id = l.entry_id JOIN accounts a ON a.id = l.account_id
      JOIN _clone_map ma ON ma.old = a.id LEFT JOIN _clone_map mp ON mp.old = l.partner_id
      WHERE l.tenant_id = src AND j.entry_date <= asof AND a.nature::text IN ('balance_sheet','assets','liabilities','equity')
      GROUP BY ma.new, mp.new HAVING sum(l.debit-l.credit) <> 0;
    IF NOT EXISTS (SELECT 1 FROM journal_lines WHERE entry_id = e) THEN DELETE FROM journal_entries WHERE id = e; END IF;
  END IF;
  IF coalesce((_opts->>'opening_stock')::boolean,false) AND coalesce((_opts->>'products')::boolean,false) AND coalesce((_opts->>'warehouses')::boolean,false) THEN
    INSERT INTO stock_moves(tenant_id, product_id, warehouse_id, move_date, direction, qty, unit_cost, reference)
      SELECT nt, mp.new, mw.new, coalesce((_opts->>'fiscal_start')::date, asof + 1), 'in', q.qty, p.avg_cost, 'opening'
      FROM (SELECT product_id, warehouse_id, sum(CASE WHEN direction='in' THEN qty ELSE -qty END) qty
            FROM stock_moves WHERE tenant_id = src AND move_date <= asof GROUP BY 1,2) q
      JOIN products p ON p.id = q.product_id
      JOIN _clone_map mp ON mp.old = q.product_id JOIN _clone_map mw ON mw.old = q.warehouse_id
      WHERE q.qty > 0;
  END IF;
  PERFORM set_config('app.bypass','',true);
  RETURN nt;
END $_$;


--
-- Name: close_fiscal_year(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.close_fiscal_year() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: close_pos_shift(numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.close_pos_shift(_amount numeric) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t uuid:=public.current_tenant_id(); a uuid; main uuid; e uuid; bal numeric;
BEGIN
 IF auth.uid() IS NULL OR t IS NULL OR NOT(public.is_tenant_admin() OR public.has_perm('documents','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 IF _amount IS NULL OR _amount<=0 OR _amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'أدخل مبلغاً موجباً'; END IF;
 a:=public.ensure_pos_drawer(auth.uid()); SELECT cash_account_id INTO main FROM tenant_settings WHERE tenant_id=t;
 IF a IS NULL OR main IS NULL OR a=main THEN RAISE EXCEPTION 'إغلاق الوردية يتطلب صندوق كاشير مستقل'; END IF;
 PERFORM 1 FROM accounts WHERE id=a FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM accounts WHERE id=main AND tenant_id=t AND NOT is_group AND is_active) THEN RAISE EXCEPTION 'الصندوق الرئيسي غير صالح'; END IF;
 SELECT coalesce(sum((l.debit-l.credit)/nullif(j.exchange_rate,0)),0) INTO bal FROM journal_lines l JOIN journal_entries j ON j.id=l.entry_id WHERE l.account_id=a AND l.tenant_id=t;
 IF _amount>bal THEN RAISE EXCEPTION 'المبلغ يتجاوز رصيد صندوقك'; END IF;
 INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,created_by) VALUES(t,0,current_date,'إغلاق وردية نقطة البيع — تسليم النقد','USD',1,'pos_shift',auth.uid()) RETURNING id INTO e;
 INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES(t,e,main,_amount,0),(t,e,a,0,_amount);
 RETURN e;
END $$;


--
-- Name: close_pos_shift(numeric, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.close_pos_shift(_amount numeric, _at timestamp with time zone DEFAULT now()) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t uuid := public.current_tenant_id(); a uuid; main uuid; e uuid; bal numeric; sid uuid;
BEGIN
  IF auth.uid() IS NULL OR t IS NULL OR NOT(public.is_tenant_admin() OR public.has_perm('documents','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _amount IS NULL OR _amount<=0 OR _amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'أدخل مبلغاً موجباً'; END IF;
  a:=public.ensure_pos_drawer(auth.uid()); SELECT cash_account_id INTO main FROM tenant_settings WHERE tenant_id=t;
  IF a IS NULL OR main IS NULL OR a=main THEN RAISE EXCEPTION 'إغلاق الوردية يتطلب صندوق كاشير مستقل'; END IF;
  PERFORM 1 FROM accounts WHERE id=a FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM accounts WHERE id=main AND tenant_id=t AND NOT is_group AND is_active) THEN RAISE EXCEPTION 'الصندوق الرئيسي غير صالح'; END IF;
  SELECT coalesce(sum((l.debit-l.credit)/nullif(j.exchange_rate,0)),0) INTO bal FROM journal_lines l JOIN journal_entries j ON j.id=l.entry_id WHERE l.account_id=a AND l.tenant_id=t;
  IF _amount>bal THEN RAISE EXCEPTION 'المبلغ يتجاوز رصيد صندوقك'; END IF;
  INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,created_by) VALUES(t,0,current_date,'إغلاق وردية نقطة البيع — تسليم النقد','USD',1,'pos_shift',auth.uid()) RETURNING id INTO e;
  INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES(t,e,main,_amount,0),(t,e,a,0,_amount);
  UPDATE public.pos_shifts SET closed_at = COALESCE(_at, now())
  WHERE user_id = auth.uid() AND tenant_id = t AND closed_at IS NULL
  RETURNING id INTO sid;
  RETURN e;
END $$;


--
-- Name: company_backup_plan(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.company_backup_plan() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: complete_mo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.complete_mo(_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE o record; s record; m record; matcost numeric := 0; bpval numeric := 0; tot numeric; net numeric; good numeric;
  e uuid; rawacc uuid; finacc uuid; matcr uuid;
BEGIN
  IF my_tenant_id() IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NOT (is_tenant_admin() OR has_perm('stock','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO o FROM manufacturing_orders WHERE id = _id AND tenant_id = my_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'أمر التصنيع غير موجود'; END IF;
  IF o.status <> 'draft' THEN RAISE EXCEPTION 'تم إنجاز أمر التصنيع مسبقاً'; END IF;
  IF NOT EXISTS (SELECT 1 FROM manufacturing_materials WHERE order_id = _id) THEN RAISE EXCEPTION 'أضف المواد الخام أولاً'; END IF;
  SELECT * INTO s FROM tenant_settings WHERE tenant_id = o.tenant_id;
  matcost := mo_material_cost(_id);
  SELECT coalesce(sum(qty*unit_value),0) INTO bpval FROM manufacturing_byproducts WHERE order_id = _id;
  tot := matcost + o.labor_cost + o.overhead_cost;
  net := greatest(tot - bpval, 0);
  good := coalesce(nullif(o.good_qty,0), o.qty * (1 - least(greatest(o.scrap_pct,0),99.99)/100));
  IF good <= 0 THEN RAISE EXCEPTION 'الكمية السليمة يجب أن تكون أكبر من صفر'; END IF;
  FOR m IN SELECT * FROM manufacturing_materials WHERE order_id = _id LOOP
    INSERT INTO stock_moves(tenant_id, product_id, warehouse_id, move_date, direction, qty, unit_cost, reference)
    VALUES (o.tenant_id, m.component_product_id, o.warehouse_id, o.mo_date, 'out', m.qty, coalesce(nullif(m.unit_cost,0),0), 'manufacture');
  END LOOP;
  INSERT INTO stock_moves(tenant_id, product_id, warehouse_id, move_date, direction, qty, unit_cost, reference)
  VALUES (o.tenant_id, o.product_id, o.warehouse_id, o.mo_date, 'in', good, net / good, 'manufacture');
  FOR m IN SELECT * FROM manufacturing_byproducts WHERE order_id = _id AND qty > 0 LOOP
    INSERT INTO stock_moves(tenant_id, product_id, warehouse_id, move_date, direction, qty, unit_cost, reference)
    VALUES (o.tenant_id, m.product_id, o.warehouse_id, o.mo_date, 'in', m.qty, m.unit_value, 'manufacture');
  END LOOP;
  SELECT id INTO rawacc FROM accounts WHERE tenant_id = o.tenant_id AND code = '1331' AND NOT is_group LIMIT 1;
  SELECT id INTO finacc FROM accounts WHERE tenant_id = o.tenant_id AND code = '1332' AND NOT is_group LIMIT 1;
  rawacc := coalesce(rawacc, s.inventory_account_id);
  finacc := coalesce(finacc, s.inventory_account_id);
  matcr := CASE WHEN o.wip_entry_id IS NOT NULL THEN o.wip_account_id ELSE rawacc END;
  IF tot > 0 AND matcr IS NOT NULL AND finacc IS NOT NULL AND matcr <> finacc THEN
    INSERT INTO journal_entries(tenant_id, entry_no, entry_date, description, currency, exchange_rate, doc_type, created_by)
    VALUES (o.tenant_id, 0, o.mo_date, 'تكلفة تصنيع - أمر رقم ' || o.mo_no, o.currency, 1, 'manufacture', auth.uid())
    RETURNING id INTO e;
    INSERT INTO journal_lines(tenant_id, entry_id, account_id, debit, credit) VALUES (o.tenant_id, e, finacc, tot, 0);
    IF matcost > 0 THEN INSERT INTO journal_lines(tenant_id, entry_id, account_id, debit, credit) VALUES (o.tenant_id, e, matcr, 0, matcost); END IF;
    IF o.labor_cost > 0 THEN INSERT INTO journal_lines(tenant_id, entry_id, account_id, debit, credit) VALUES (o.tenant_id, e, coalesce(s.salaries_account_id, rawacc), 0, o.labor_cost); END IF;
    IF o.overhead_cost > 0 THEN INSERT INTO journal_lines(tenant_id, entry_id, account_id, debit, credit) VALUES (o.tenant_id, e, coalesce(o.overhead_account_id, s.salaries_account_id, rawacc), 0, o.overhead_cost); END IF;
  END IF;
  UPDATE manufacturing_orders SET status = 'completed', stage = 'completed', journal_entry_id = e, good_qty = good, actual_total_cost = net WHERE id = _id;
  RETURN e;
END $$;


--
-- Name: currency_delete_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.currency_delete_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: current_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.tenant_id FROM public.profiles p JOIN public.tenants t ON t.id = p.tenant_id
  WHERE p.id = auth.uid() AND p.is_active AND t.is_active AND t.sub_end >= current_date
$$;


--
-- Name: decide_approval(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.decide_approval(_id uuid, _approve boolean, _note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r public.approval_requests;
BEGIN
  SELECT * INTO r FROM public.approval_requests WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF NOT (public.is_super_admin() OR (public.is_tenant_admin() AND r.tenant_id = public.current_tenant_id())) THEN
    RAISE EXCEPTION 'الاعتماد متاح لمدير الشركة فقط';
  END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'تم البت في هذا الطلب مسبقاً'; END IF;
  UPDATE public.approval_requests SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    decided_by = auth.uid(), decided_at = now(), decision_note = nullif(_note, '') WHERE id = _id;
  PERFORM public.notify_user(r.requested_by, r.tenant_id,
    CASE WHEN _approve THEN 'تم اعتماد: ' ELSE 'تم رفض: ' END || r.title, nullif(_note, ''), 'approval', '/approvals');
END $$;


--
-- Name: document_lines_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.document_lines_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM public.documents WHERE id = COALESCE(NEW.document_id, OLD.document_id);
  IF s = 'posted' THEN RAISE EXCEPTION 'لا يمكن تعديل بنود مستند مرحّل'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;


--
-- Name: document_lines_no_group(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.document_lines_no_group() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id AND is_group) THEN
    RAISE EXCEPTION 'لا يمكن استخدام تصنيف كمادة في الفاتورة';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: documents_before(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.documents_before() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.doc_no IS NULL THEN
      SELECT COALESCE(MAX(doc_no),0)+1 INTO NEW.doc_no FROM public.documents
       WHERE tenant_id = NEW.tenant_id AND doc_type = NEW.doc_type;
    END IF;
    NEW.status := 'draft'; NEW.journal_entry_id := NULL;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'posted' AND current_setting('app.posting', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'لا يمكن تعديل مستند مرحّل، ألغِ الترحيل أولاً';
    END IF;
    IF NEW.status <> OLD.status AND current_setting('app.posting', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'استخدم زر الترحيل لتغيير حالة المستند';
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.status = 'posted' THEN RAISE EXCEPTION 'لا يمكن حذف مستند مرحّل، ألغِ الترحيل أولاً'; END IF;
    RETURN OLD;
  END IF;
END $$;


--
-- Name: emit_notification(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.emit_notification(_tenant uuid, _kind text, _title text, _body text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO public.notifications(tenant_id, kind, title, body, created_by)
  SELECT _tenant, _kind, _title, _body, auth.uid() WHERE coalesce(current_setting('app.restoring', true),'') <> 'on';
$$;


--
-- Name: emit_notification(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.emit_notification(_tenant uuid, _kind text, _title text, _body text, _link text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO public.notifications(tenant_id, kind, title, body, created_by, link)
  SELECT _tenant, _kind, _title, _body, auth.uid(), _link WHERE coalesce(current_setting('app.restoring', true),'') <> 'on';
$$;


--
-- Name: enable_branches(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.enable_branches(_on boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE t uuid := current_tenant_id(); mb uuid; tb text;
BEGIN
  IF t IS NULL OR NOT is_tenant_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  INSERT INTO tenant_settings(tenant_id, has_branches) VALUES (t, _on)
    ON CONFLICT (tenant_id) DO UPDATE SET has_branches = _on, updated_at = now();
  IF NOT _on THEN RETURN NULL; END IF;
  SELECT id INTO mb FROM branches WHERE tenant_id=t ORDER BY code LIMIT 1;
  IF mb IS NULL THEN
    INSERT INTO branches(tenant_id, code, name) VALUES (t, '01', 'الفرع الرئيسي') RETURNING id INTO mb;
  END IF;
  PERFORM set_config('app.bypass','1',true);
  FOREACH tb IN ARRAY ARRAY['documents','journal_entries','journal_lines','stock_moves','warehouses','cheques','banks','projects','payroll_runs','pos_shifts','employees','fixed_assets','hotel_reservations','manufacturing_orders'] LOOP
    IF to_regclass('public.'||tb) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('UPDATE public.%I SET branch_id = $1 WHERE tenant_id = $2 AND branch_id IS NULL', tb) USING mb, t;
  END LOOP;
  RETURN mb;
END $_$;


--
-- Name: enforce_primary_pattern_access(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.enforce_primary_pattern_access() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE denied jsonb;
BEGIN
  IF NEW.pattern_id IS NOT NULL OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT ts.primary_pattern_denied -> (auth.uid())::text INTO denied FROM public.tenant_settings ts WHERE ts.tenant_id = NEW.tenant_id;
  IF denied IS NOT NULL AND jsonb_typeof(denied) = 'array' AND denied ? NEW.doc_type THEN
    RAISE EXCEPTION 'لا تملك صلاحية استخدام النمط الأساسي لهذا المستند؛ استخدم نمطاً مخصصاً لك';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: ensure_entity_parent_account(text, uuid, uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.ensure_entity_parent_account(_table text, _id uuid, _tenant uuid, _seen uuid[] DEFAULT '{}'::uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE r jsonb; a uuid; parent_account uuid; kind text;
BEGIN
  IF _table NOT IN ('partners','warehouses','projects','cost_centers') OR _id=ANY(_seen) THEN RAISE EXCEPTION 'تصنيف أب غير صالح'; END IF;
  EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE id=$1 AND tenant_id=$2 AND is_group',_table) INTO r USING _id,_tenant;
  IF r IS NULL THEN RAISE EXCEPTION 'اختر تصنيفاً تجميعياً من الشركة نفسها'; END IF;
  a := (r->>'account_id')::uuid;
  IF a IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=a AND tenant_id=_tenant AND is_group) THEN RAISE EXCEPTION 'الحساب المرتبط للتصنيف الأب يجب أن يكون تجميعياً'; END IF;
    RETURN a;
  END IF;
  IF r->>'parent_id' IS NOT NULL THEN
    parent_account := public.ensure_entity_parent_account(_table,(r->>'parent_id')::uuid,_tenant,array_append(_seen,_id));
  END IF;
  kind := CASE WHEN _table='partners' THEN CASE WHEN r->>'partner_type'='supplier' THEN 'supplier' ELSE 'customer' END ELSE _table END;
  a := public.entity_ledger_account(_tenant,parent_account,r->>'name',true,r->>'currency',kind);
  EXECUTE format('UPDATE public.%I SET account_id=$1 WHERE id=$2 AND tenant_id=$3',_table) USING a,_id,_tenant;
  RETURN a;
END $_$;


--
-- Name: ensure_opening_entry(uuid, date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.ensure_opening_entry(_tenant uuid, _date date, _branch uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE e uuid; cur text;
BEGIN
  SELECT id INTO e FROM journal_entries WHERE tenant_id=_tenant AND doc_type='opening' LIMIT 1;
  IF e IS NOT NULL THEN RETURN e; END IF;
  SELECT coalesce((SELECT base_currency::text FROM tenant_settings WHERE tenant_id=_tenant),'USD') INTO cur;
  INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,created_by,branch_id)
  VALUES(_tenant,0,_date,'القيد الافتتاحي',cur::currency_code,1,'opening',auth.uid(),_branch) RETURNING id INTO e;
  RETURN e;
EXCEPTION WHEN undefined_column THEN
  INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,created_by,branch_id)
  VALUES(_tenant,0,_date,'القيد الافتتاحي','USD',1,'opening',auth.uid(),_branch) RETURNING id INTO e;
  RETURN e;
END $$;


--
-- Name: ensure_pos_drawer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.ensure_pos_drawer(_user uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE p record; a uuid; main uuid; b record;
BEGIN
 SELECT * INTO p FROM profiles WHERE id=_user;
 IF p.tenant_id IS NULL OR p.account_kind NOT IN ('sales_cashier','purchase_cashier') THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_user::text,0));
 SELECT account_id INTO a FROM user_cash_drawers WHERE user_id=_user AND tenant_id=p.tenant_id;
 IF a IS NOT NULL THEN RETURN a; END IF;
 IF EXISTS(SELECT 1 FROM user_cash_drawers WHERE user_id=_user) THEN RAISE EXCEPTION 'الحساب مرتبط بصندوق شركة أخرى'; END IF;
 SELECT cash_account_id INTO main FROM tenant_settings WHERE tenant_id=p.tenant_id;
 IF main IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO b FROM accounts WHERE id=main AND tenant_id=p.tenant_id;
 IF b.id IS NULL THEN RAISE EXCEPTION 'حساب صندوق الشركة غير صالح'; END IF;
 INSERT INTO accounts(tenant_id,code,name,parent_id,nature,currency,is_group,is_active) VALUES(p.tenant_id,b.code||'-POS-'||replace(_user::text,'-',''),'صندوق نقطة البيع — '||p.full_name,main,b.nature,b.currency,false,true) RETURNING id INTO a;
 INSERT INTO user_cash_drawers(user_id,tenant_id,account_id) VALUES(_user,p.tenant_id,a);
 RETURN a;
END $$;


--
-- Name: entity_auto_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.entity_auto_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE parent_account uuid; cur text; a public.accounts%rowtype;
BEGIN
  IF current_setting('app.restoring',true)='on' OR current_setting('app.bypass',true)='1' THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM public.current_tenant_id() AND NOT public.is_super_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NEW.account_id IS NOT NULL THEN
    SELECT * INTO a FROM public.accounts WHERE id=NEW.account_id AND tenant_id=NEW.tenant_id;
    IF a.id IS NULL THEN RAISE EXCEPTION 'اختر حساباً من الشركة نفسها'; END IF;
    IF TG_OP='INSERT' THEN
      IF a.is_group IS DISTINCT FROM NEW.is_group THEN RAISE EXCEPTION 'نوع الحساب المرتبط لا يطابق البطاقة'; END IF;
    ELSIF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
      IF a.is_group IS DISTINCT FROM NEW.is_group THEN RAISE EXCEPTION 'نوع الحساب المرتبط لا يطابق البطاقة'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
  IF NEW.parent_id IS NOT NULL THEN
    parent_account := public.ensure_entity_parent_account(TG_TABLE_NAME,NEW.parent_id,NEW.tenant_id,ARRAY[NEW.id]);
  END IF;
  cur := to_jsonb(NEW)->>'currency';
  NEW.account_id := public.entity_ledger_account(NEW.tenant_id,parent_account,NEW.name,NEW.is_group,cur,TG_TABLE_NAME);
  RETURN NEW;
END $$;


--
-- Name: entity_ledger_account(uuid, uuid, text, boolean, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.entity_ledger_account(_tenant uuid, _parent uuid, _name text, _group boolean, _currency text, _kind text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE s public.tenant_settings%rowtype; p public.accounts%rowtype; closing_id uuid; result_id uuid; c text; n bigint:=1; width integer; cur text; nat public.account_nature;
BEGIN
 IF _kind NOT IN ('customer','supplier','warehouses','projects','cost_centers') THEN RAISE EXCEPTION 'نوع الحساب غير صالح'; END IF;
 IF auth.uid() IS NOT NULL AND _tenant IS DISTINCT FROM public.current_tenant_id() AND NOT public.is_super_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_tenant::text,8417));
 SELECT * INTO s FROM public.tenant_settings WHERE tenant_id=_tenant;
 cur:=coalesce(nullif(_currency,''),s.base_currency::text,'USD');
 nat:=CASE _kind WHEN 'supplier' THEN 'liabilities'::public.account_nature WHEN 'projects' THEN 'expenses'::public.account_nature WHEN 'cost_centers' THEN 'cost_centers'::public.account_nature ELSE 'assets'::public.account_nature END;
 _parent:=coalesce(_parent,nullif(s.entity_account_roots->>_kind,'')::uuid,CASE _kind WHEN 'customer' THEN s.customers_account_id WHEN 'supplier' THEN s.suppliers_account_id WHEN 'warehouses' THEN s.inventory_account_id WHEN 'projects' THEN s.project_cost_account_id END);
 SELECT * INTO p FROM public.accounts WHERE id=_parent AND tenant_id=_tenant;
 IF (p.id IS NULL OR NOT p.is_group) AND _kind='projects' THEN RETURN NULL; END IF;
 IF p.id IS NULL OR NOT p.is_group THEN RAISE EXCEPTION 'حدد الحساب التجميعي الأب لهذا الدليل أولاً'; END IF;
 IF NOT _group THEN
  closing_id:=coalesce(nullif(s.closing_account_links->>CASE WHEN _kind IN ('projects','cost_centers') THEN 'profit_loss' ELSE 'balance_sheet' END,'')::uuid,p.closing_account_id);
  IF closing_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=closing_id AND tenant_id=_tenant AND nature='closing' AND NOT is_group) THEN RAISE EXCEPTION 'حدد الحساب الختامي الموجود في الربط المحاسبي'; END IF;
 END IF;
 width:=CASE WHEN coalesce(s.standard_coding,false) AND NOT _group THEN coalesce(s.account_code_len,12)-length(p.code) ELSE 2 END;
 IF width<=0 THEN RAISE EXCEPTION 'رمز الحساب الأب لا يترك مساحة لحساب فرعي'; END IF;
 LOOP
  IF length(n::text)>width THEN RAISE EXCEPTION 'نفدت أرقام الحسابات الفرعية لهذا الأب'; END IF;
  c:=p.code||lpad(n::text,width,'0');
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.accounts WHERE tenant_id=_tenant AND code=c);
  n:=n+1;
 END LOOP;
 INSERT INTO public.accounts(tenant_id,code,name,parent_id,nature,currency,is_group,closing_account_id,cash_flow_type,is_monetary,entity_generated) VALUES(_tenant,c,_name,p.id,nat,cur::public.currency_code,_group,closing_id,CASE WHEN _group THEN NULL ELSE 'operating' END,NOT _group AND _kind IN ('customer','supplier'),true) RETURNING id INTO result_id;
 RETURN result_id;
END $$;


--
-- Name: finalize_stocktake(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.finalize_stocktake(_id uuid, _entries uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: fiscal_close_preview(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.fiscal_close_preview() RETURNS TABLE(account_id uuid, code text, name text, kind text, balance numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: fx_rate_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.fx_rate_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE b text;
BEGIN
  SELECT base_currency INTO b FROM tenant_settings WHERE tenant_id=NEW.tenant_id;
  IF NEW.currency::text <> coalesce(b,'USD') AND NOT (coalesce(NEW.exchange_rate,0) > 0) THEN
    RAISE EXCEPTION 'سعر الصرف مطلوب للعملة % (كم % = 1 %)', NEW.currency, NEW.currency, coalesce(b,'USD');
  END IF;
  RETURN NEW;
END $$;


--
-- Name: fx_rate_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.fx_rate_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE prev numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN prev := OLD.rate_to_usd;
  ELSE SELECT rate_to_usd INTO prev FROM exchange_rates WHERE tenant_id = NEW.tenant_id AND currency = NEW.currency AND rate_date <= NEW.rate_date AND id <> NEW.id ORDER BY rate_date DESC LIMIT 1;
  END IF;
  IF prev IS DISTINCT FROM NEW.rate_to_usd THEN
    INSERT INTO fx_log(tenant_id, kind, rate_date, currency, old_rate, new_rate, source, created_by)
    VALUES (NEW.tenant_id, 'rate_change', NEW.rate_date, NEW.currency::text, prev, NEW.rate_to_usd, NEW.source, auth.uid());
  END IF;
  RETURN NEW;
END $$;


--
-- Name: grant_default_permissions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.grant_default_permissions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE m text;
BEGIN
  IF NEW.tenant_id IS NULL OR NOT NEW.is_tenant_admin THEN RETURN NEW; END IF;
  FOREACH m IN ARRAY ARRAY['accounts','journal','documents','partners','cheques','assets','products','warehouses','stock','projects','payroll','reports','users','audit'] LOOP
    INSERT INTO public.user_permissions (tenant_id, user_id, module, can_view, can_create, can_edit, can_delete)
    VALUES (NEW.tenant_id, NEW.id, m, true, true, true, true)
    ON CONFLICT (user_id, module) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;


--
-- Name: guard_doc_period(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.guard_doc_period() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE cu date;
BEGIN
  IF current_setting('app.bypass', true) = '1' THEN RETURN coalesce(NEW,OLD); END IF;
  SELECT closed_until INTO cu FROM tenant_settings WHERE tenant_id=coalesce(NEW.tenant_id,OLD.tenant_id);
  IF cu IS NOT NULL AND (
    (TG_OP<>'INSERT' AND OLD.doc_date <= cu) OR (TG_OP<>'DELETE' AND NEW.doc_date <= cu)
  ) THEN
    RAISE EXCEPTION 'الفترة مقفلة حتى % — لا يمكن إضافة أو تعديل مستندات قبل هذا التاريخ', cu;
  END IF;
  RETURN coalesce(NEW,OLD);
END $$;


--
-- Name: guard_entity_account_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.guard_entity_account_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
 IF OLD.account_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.journal_lines WHERE account_id=OLD.account_id) OR EXISTS(SELECT 1 FROM public.document_lines WHERE account_id=OLD.account_id) OR EXISTS(SELECT 1 FROM public.documents WHERE account_id=OLD.account_id OR partner_account_id=OLD.account_id OR cash_account_id=OLD.account_id)) THEN RAISE EXCEPTION 'لا يمكن حذف البطاقة لأن حسابها المرتبط له حركات؛ يمكنك إلغاء تفعيلها'; END IF;
 IF TG_TABLE_NAME='cost_centers' AND EXISTS(SELECT 1 FROM public.journal_lines WHERE cost_center_id=OLD.id) THEN RAISE EXCEPTION 'لا يمكن حذف مركز الكلفة لوجود حركات'; END IF;
 RETURN OLD;
END $$;


--
-- Name: guard_entry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.guard_entry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE cu date;
BEGIN
  IF current_setting('app.bypass', true) = '1' THEN RETURN coalesce(NEW,OLD); END IF;
  IF TG_OP='DELETE' AND OLD.audited THEN RAISE EXCEPTION 'لا يمكن حذف قيد مدقق'; END IF;
  IF TG_OP='UPDATE' AND OLD.audited AND NEW.audited THEN RAISE EXCEPTION 'لا يمكن تعديل قيد مدقق'; END IF;
  SELECT closed_until INTO cu FROM tenant_settings WHERE tenant_id=coalesce(NEW.tenant_id,OLD.tenant_id);
  IF cu IS NOT NULL AND (CASE WHEN TG_OP='DELETE' THEN OLD.entry_date ELSE NEW.entry_date END) <= cu THEN
    RAISE EXCEPTION 'الفترة مقفلة حتى %', cu;
  END IF;
  RETURN coalesce(NEW,OLD);
END $$;


--
-- Name: guard_linked_account_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.guard_linked_account_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.partners WHERE account_id=OLD.id AND partner_type<>'supplier') THEN RAISE EXCEPTION 'لا يمكن حذف الحساب المرتبط؛ اذهب لبطاقة الزبون للتعديل'; END IF;
 IF EXISTS(SELECT 1 FROM public.partners WHERE account_id=OLD.id) THEN RAISE EXCEPTION 'لا يمكن حذف الحساب المرتبط؛ اذهب لبطاقة المورد للتعديل'; END IF;
 IF EXISTS(SELECT 1 FROM public.warehouses WHERE account_id=OLD.id) THEN RAISE EXCEPTION 'لا يمكن حذف الحساب المرتبط؛ اذهب لبطاقة المستودع للتعديل'; END IF;
 IF EXISTS(SELECT 1 FROM public.cost_centers WHERE account_id=OLD.id) THEN RAISE EXCEPTION 'لا يمكن حذف الحساب المرتبط؛ اذهب لبطاقة مركز الكلفة للتعديل'; END IF;
 IF EXISTS(SELECT 1 FROM public.projects WHERE account_id=OLD.id) THEN RAISE EXCEPTION 'لا يمكن حذف الحساب المرتبط؛ اذهب لبطاقة المشروع للتعديل'; END IF;
 RETURN OLD;
END $$;


--
-- Name: guard_opening_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.guard_opening_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.doc_type='opening' AND current_setting('app.posting', true) IS DISTINCT FROM 'on' AND EXISTS(SELECT 1 FROM journal_lines WHERE entry_id=OLD.id AND source_document_id IS NOT NULL) THEN
    RAISE EXCEPTION 'ألغِ ترحيل فواتير بضاعة أول المدة قبل حذف القيد الافتتاحي';
  END IF;
  RETURN OLD;
END $$;


--
-- Name: guard_source_lines(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.guard_source_lines() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_setting('app.posting', true)='on' OR current_setting('app.bypass', true)='1' OR current_setting('app.restoring', true)='on' THEN RETURN coalesce(NEW,OLD); END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.source_document_id IS NOT NULL THEN RAISE EXCEPTION 'سطر المستودع مولّد من فاتورة بضاعة أول المدة ولا يُعدّل إلا منها'; END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.source_document_id IS NOT NULL THEN RAISE EXCEPTION 'لا يمكن إنشاء سطر مولّد يدوياً'; END IF;
  RETURN coalesce(NEW,OLD);
END $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: has_perm(text, public.perm_action); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.has_perm(_module text, _action public.perm_action) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_super_admin() OR (public.tenant_active() AND (
    (public.is_auditor() AND _action = 'view') OR
    (public.is_tenant_admin() AND NOT EXISTS (SELECT 1 FROM public.tenant_features f WHERE f.tenant_id = public.current_tenant_id() AND f.module = _module AND NOT f.enabled)) OR
    EXISTS (SELECT 1 FROM public.user_permissions p
      WHERE p.user_id = auth.uid()
        AND (p.module = _module OR (_module = 'documents' AND p.module IN ('sales','purchases','inventory')))
        AND CASE _action WHEN 'view' THEN p.can_view WHEN 'create' THEN p.can_create
          WHEN 'edit' THEN p.can_edit WHEN 'delete' THEN p.can_delete END)))
$$;


--
-- Name: hotel_check_in(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.hotel_check_in(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r record;
BEGIN
  IF my_tenant_id() IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NOT (is_tenant_admin() OR has_perm('documents','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO r FROM hotel_reservations WHERE id = _id AND tenant_id = my_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الحجز غير موجود'; END IF;
  IF r.status <> 'reserved' THEN RAISE EXCEPTION 'حالة الحجز لا تسمح بتسجيل الدخول'; END IF;
  IF EXISTS (SELECT 1 FROM hotel_reservations WHERE tenant_id = r.tenant_id AND room_id = r.room_id AND status = 'checked_in') THEN
    RAISE EXCEPTION 'الغرفة مشغولة حالياً';
  END IF;
  UPDATE hotel_reservations SET status = 'checked_in' WHERE id = _id;
  UPDATE hotel_rooms SET status = 'occupied' WHERE id = r.room_id;
END $$;


--
-- Name: hotel_check_out(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.hotel_check_out(_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r record; s record; e uuid; advacc uuid; total numeric; adv numeric;
BEGIN
  IF my_tenant_id() IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NOT (is_tenant_admin() OR has_perm('documents','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO r FROM hotel_reservations WHERE id = _id AND tenant_id = my_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الحجز غير موجود'; END IF;
  IF r.status <> 'checked_in' THEN RAISE EXCEPTION 'النزيل غير مقيم حالياً'; END IF;
  SELECT * INTO s FROM tenant_settings WHERE tenant_id = r.tenant_id;
  IF s.sales_account_id IS NULL OR s.customers_account_id IS NULL THEN RAISE EXCEPTION 'أكمل الربط المحاسبي في الإعدادات أولاً'; END IF;
  total := r.nights * r.rate;
  adv := least(r.advance_amount, total);
  IF adv > 0 THEN
    SELECT id INTO advacc FROM accounts WHERE tenant_id = r.tenant_id AND code = '2111' AND NOT is_group LIMIT 1;
  END IF;
  INSERT INTO journal_entries(tenant_id, entry_no, entry_date, description, currency, exchange_rate, doc_type, created_by)
  VALUES (r.tenant_id, 0, current_date, 'إقامة النزيل ' || r.guest_name, r.currency, 1, 'sale', auth.uid())
  RETURNING id INTO e;
  IF adv > 0 AND advacc IS NOT NULL THEN
    INSERT INTO journal_lines(tenant_id, entry_id, account_id, debit, credit) VALUES
      (r.tenant_id, e, s.customers_account_id, total, 0),
      (r.tenant_id, e, s.sales_account_id, 0, total),
      (r.tenant_id, e, advacc, adv, 0),
      (r.tenant_id, e, s.customers_account_id, 0, adv);
  ELSE
    INSERT INTO journal_lines(tenant_id, entry_id, account_id, debit, credit) VALUES
      (r.tenant_id, e, s.customers_account_id, total, 0),
      (r.tenant_id, e, s.sales_account_id, 0, total);
  END IF;
  UPDATE hotel_reservations SET status = 'checked_out', journal_entry_id = e WHERE id = _id;
  UPDATE hotel_rooms SET status = 'available' WHERE id = r.room_id;
  RETURN e;
END $$;


--
-- Name: hotel_receive_advance(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.hotel_receive_advance(_id uuid, _amount numeric) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r record; s record; e uuid; advacc uuid;
BEGIN
  IF my_tenant_id() IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NOT (is_tenant_admin() OR has_perm('documents','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'أدخل مبلغ الدفعة'; END IF;
  SELECT * INTO r FROM hotel_reservations WHERE id = _id AND tenant_id = my_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الحجز غير موجود'; END IF;
  IF r.status NOT IN ('reserved','checked_in') THEN RAISE EXCEPTION 'حالة الحجز لا تسمح باستقبال دفعة'; END IF;
  SELECT * INTO s FROM tenant_settings WHERE tenant_id = r.tenant_id;
  SELECT id INTO advacc FROM accounts WHERE tenant_id = r.tenant_id AND code = '2111' AND NOT is_group LIMIT 1;
  IF advacc IS NULL THEN RAISE EXCEPTION 'أضف حساب دفعات النزلاء المقدمة (كود 2111) أولاً'; END IF;
  IF s.cash_account_id IS NULL THEN RAISE EXCEPTION 'حدد حساب الصندوق في الإعدادات أولاً'; END IF;
  INSERT INTO journal_entries(tenant_id, entry_no, entry_date, description, currency, exchange_rate, doc_type, created_by)
  VALUES (r.tenant_id, 0, current_date, 'دفعة مقدمة من النزيل ' || r.guest_name, r.currency, 1, 'receipt', auth.uid())
  RETURNING id INTO e;
  INSERT INTO journal_lines(tenant_id, entry_id, account_id, debit, credit) VALUES
    (r.tenant_id, e, s.cash_account_id, _amount, 0),
    (r.tenant_id, e, advacc, 0, _amount);
  UPDATE hotel_reservations SET advance_amount = advance_amount + _amount WHERE id = _id;
  RETURN e;
END $$;


--
-- Name: inventory_method_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.inventory_method_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$ BEGIN
 IF NEW.inventory_method NOT IN ('periodic','perpetual') THEN RAISE EXCEPTION 'اختر الجرد الدوري أو المستمر'; END IF;
 IF TG_OP='UPDATE' AND OLD.onboarding_done AND NEW.inventory_method IS DISTINCT FROM OLD.inventory_method THEN RAISE EXCEPTION 'لا يمكن تغيير نظام الجرد بعد تجهيز الشركة'; END IF;
 RETURN NEW; END $$;


--
-- Name: is_auditor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.is_auditor() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE((SELECT is_auditor FROM public.profiles WHERE id = auth.uid()), false)
$$;


--
-- Name: is_auditor_or_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.is_auditor_or_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_auditor() OR public.is_tenant_admin() OR public.is_super_admin()
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false)
$$;


--
-- Name: is_tenant_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.is_tenant_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE((SELECT is_tenant_admin FROM public.profiles WHERE id = auth.uid()), false)
$$;


--
-- Name: linked_account_currency_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.linked_account_currency_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$ BEGIN
 IF NEW.currency IS DISTINCT FROM OLD.currency AND EXISTS(SELECT 1 FROM public.partners WHERE account_id=OLD.id AND NOT is_group) AND current_setting('app.partner_currency_sync',true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'غيّر عملة الحساب من بطاقة الزبون أو المورد'; END IF;
 RETURN NEW; END $$;


--
-- Name: lock_monetary_after_moves(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.lock_monetary_after_moves() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.is_monetary IS DISTINCT FROM OLD.is_monetary THEN
    IF EXISTS (SELECT 1 FROM public.journal_lines WHERE account_id = OLD.id) THEN
      RAISE EXCEPTION 'لا يمكن تغيير خيار نقدي/غير نقدي لحساب جرت عليه حركات';
    END IF;
    -- Once chosen for a foreign-currency account the choice is final (unless the currency itself changes).
    IF NEW.currency IS NOT DISTINCT FROM OLD.currency AND OLD.is_group = false THEN
      RAISE EXCEPTION 'خيار نقدي/غير نقدي يُحدد مرة واحدة عند إنشاء الحساب ولا يمكن تعديله';
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: mark_notifications_seen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.mark_notifications_seen() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE profiles SET notif_seen_at=now() WHERE id=auth.uid();
$$;


--
-- Name: mo_material_cost(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.mo_material_cost(_id uuid) RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(sum(mm.qty * coalesce(nullif(mm.unit_cost,0), p.avg_cost, 0)),0)
  FROM manufacturing_materials mm JOIN products p ON p.id = mm.component_product_id
  WHERE mm.order_id = _id AND mm.tenant_id = my_tenant_id()
$$;


--
-- Name: my_branch_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.my_branch_scope() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE WHEN p.is_super_admin OR NOT coalesce(s.has_branches,false) THEN NULL
              ELSE coalesce(p.branch_id, p.active_branch_id) END
  FROM profiles p LEFT JOIN tenant_settings s ON s.tenant_id = p.tenant_id
  WHERE p.id = auth.uid()
$$;


--
-- Name: my_data_files(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.my_data_files() RETURNS TABLE(id uuid, name text, fiscal_label text, is_current boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT t.id, t.name, t.fiscal_label, t.id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
  FROM tenant_members m JOIN tenants t ON t.id = m.tenant_id
  WHERE m.user_id = auth.uid() ORDER BY t.created_at
$$;


--
-- Name: my_pos_cash(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.my_pos_cash() RETURNS TABLE(account_id uuid, main_account_id uuid, balance numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t uuid:=public.current_tenant_id(); a uuid; main uuid;
BEGIN
 IF auth.uid() IS NULL OR t IS NULL OR NOT (public.is_tenant_admin() OR public.has_perm('documents','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 SELECT cash_account_id INTO main FROM tenant_settings WHERE tenant_id=t;
 a:=coalesce(public.ensure_pos_drawer(auth.uid()),main);
 RETURN QUERY SELECT a,main,coalesce(sum((l.debit-l.credit)/nullif(e.exchange_rate,0)),0) FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.account_id=a AND l.tenant_id=t;
END $$;


--
-- Name: my_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.my_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;


--
-- Name: notes_notify(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notes_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _who text;
BEGIN
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> NEW.user_id AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    SELECT full_name INTO _who FROM profiles WHERE id = NEW.user_id;
    PERFORM notify_user(NEW.assigned_to, NEW.tenant_id, CASE WHEN NEW.kind='request' THEN 'طلب جديد من ' ELSE 'مهمة جديدة من ' END || coalesce(_who,'زميل'), coalesce(nullif(NEW.title,''), left(NEW.body,120)), 'task', '/');
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT NULL AND auth.uid() = NEW.assigned_to AND NEW.user_id <> NEW.assigned_to
     AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.reply IS DISTINCT FROM NEW.reply) THEN
    SELECT full_name INTO _who FROM profiles WHERE id = NEW.assigned_to;
    PERFORM notify_user(NEW.user_id, NEW.tenant_id, coalesce(_who,'زميل') || CASE NEW.status WHEN 'done' THEN ' أنجز المهمة' WHEN 'in_progress' THEN ' بدأ العمل على المهمة' ELSE ' ردّ على المهمة' END, coalesce(nullif(NEW.title,''), left(NEW.body,120)) || CASE WHEN NEW.reply<>'' THEN ' — ' || NEW.reply ELSE '' END, 'task', '/');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;


--
-- Name: notify_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notify_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE lbl text; lk text;
BEGIN
  IF TG_TABLE_NAME = 'documents' THEN
    lk := '/documents?open=' || NEW.id;
    lbl := CASE NEW.doc_type WHEN 'sale' THEN 'فاتورة مبيع' WHEN 'purchase' THEN 'فاتورة شراء' WHEN 'receipt' THEN 'سند قبض'
      WHEN 'payment' THEN 'سند دفع' WHEN 'transfer' THEN 'مناقلة' WHEN 'stock_in' THEN 'إدخال مستودع' ELSE 'إخراج مستودع' END;
    IF TG_OP = 'INSERT' AND NEW.doc_type IN ('sale','purchase') THEN
      PERFORM emit_notification(NEW.tenant_id, 'invoice_created', lbl || ' جديدة', 'رقم ' || coalesce(NEW.doc_no::text,'-'), lk);
    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted' THEN
      PERFORM emit_notification(NEW.tenant_id, 'document_posted', 'ترحيل ' || lbl, 'رقم ' || coalesce(NEW.doc_no::text,'-') || ' بمبلغ ' || NEW.amount, lk);
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'posted' AND NEW.status <> 'posted' THEN
      PERFORM emit_notification(NEW.tenant_id, 'document_posted', 'إلغاء ترحيل ' || lbl, 'رقم ' || coalesce(NEW.doc_no::text,'-'), lk);
    END IF;
  ELSIF TG_TABLE_NAME = 'journal_entries' THEN
    IF NEW.audited AND NOT OLD.audited THEN
      PERFORM emit_notification(NEW.tenant_id, 'entry_audited', 'تدقيق قيد', 'القيد رقم ' || NEW.entry_no, '/journal/' || NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'payroll_runs' THEN
    PERFORM emit_notification(NEW.tenant_id, 'payroll_posted', 'ترحيل رواتب ' || NEW.month, 'الصافي ' || NEW.total_net, '/payroll');
  ELSIF TG_TABLE_NAME = 'cheques' THEN
    PERFORM emit_notification(NEW.tenant_id, 'cheque_added', 'شيك جديد ' || NEW.cheque_no, 'المبلغ ' || NEW.amount || '، الاستحقاق ' || NEW.due_date, '/cheques');
  ELSIF TG_TABLE_NAME = 'products' THEN
    IF NEW.reorder_level > 0 AND NEW.qty_on_hand <= NEW.reorder_level AND OLD.qty_on_hand > OLD.reorder_level THEN
      PERFORM emit_notification(NEW.tenant_id, 'low_stock', 'نقص مخزون: ' || NEW.name, 'الكمية الحالية ' || NEW.qty_on_hand, '/products');
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: notify_note_reminder(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notify_note_reminder(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE n personal_notes;
BEGIN
  SELECT * INTO n FROM personal_notes WHERE id = _id AND (user_id = auth.uid() OR assigned_to = auth.uid());
  IF n.id IS NULL THEN RETURN; END IF;
  PERFORM notify_user(auth.uid(), coalesce(n.tenant_id, my_tenant_id()), '⏰ تذكير: ' || coalesce(nullif(n.title,''),'ملاحظة'), left(n.body, 300), 'reminder', '/');
END $$;


--
-- Name: notify_super_admins(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notify_super_admins(_tenant uuid, _title text, _body text, _kind text, _link text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO public.notifications(user_id, tenant_id, title, body, kind, link)
  SELECT p.id, NULL, _title, _body, _kind, _link FROM public.profiles p
  WHERE p.is_super_admin AND p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
    AND coalesce(current_setting('app.restoring', true),'') <> 'on';
$$;


--
-- Name: notify_tenant_admins(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notify_tenant_admins(_tenant uuid, _title text, _body text, _kind text, _link text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO public.notifications(user_id, tenant_id, title, body, kind, link)
  SELECT p.id, _tenant, _title, _body, _kind, _link FROM public.profiles p
  WHERE p.tenant_id = _tenant AND p.is_tenant_admin AND p.is_active AND p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
    AND coalesce(current_setting('app.restoring', true),'') <> 'on';
$$;


--
-- Name: notify_user(uuid, uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notify_user(_user uuid, _tenant uuid, _title text, _body text, _kind text, _link text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO public.notifications(user_id, tenant_id, title, body, kind, link)
  SELECT _user, _tenant, _title, _body, _kind, _link WHERE coalesce(current_setting('app.restoring', true),'') <> 'on';
$$;


--
-- Name: open_pos_shift(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.open_pos_shift(_at timestamp with time zone DEFAULT now()) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t uuid := public.current_tenant_id(); s uuid;
BEGIN
  IF auth.uid() IS NULL OR t IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF EXISTS (SELECT 1 FROM public.pos_shifts WHERE user_id = auth.uid() AND closed_at IS NULL) THEN
    RAISE EXCEPTION 'لديك وردية مفتوحة مسبقاً';
  END IF;
  PERFORM public.ensure_pos_drawer(auth.uid());
  INSERT INTO public.pos_shifts (tenant_id, user_id, opened_at)
  VALUES (t, auth.uid(), COALESCE(_at, now()))
  RETURNING id INTO s;
  RETURN s;
END $$;


--
-- Name: partner_auto_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.partner_auto_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE parent_account uuid; cur text; base_cur text; a public.accounts%rowtype;
BEGIN
  IF current_setting('app.restoring',true)='on' OR current_setting('app.bypass',true)='1' THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM public.current_tenant_id() AND NOT public.is_super_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT coalesce(base_currency::text,'USD') INTO base_cur FROM public.tenant_settings WHERE tenant_id=NEW.tenant_id;
  base_cur := coalesce(base_cur,'USD');
  IF NEW.account_id IS NULL THEN
    parent_account := NEW.auto_parent_account_id;
    IF parent_account IS NULL AND NEW.parent_id IS NOT NULL THEN
      parent_account := public.ensure_entity_parent_account('partners',NEW.parent_id,NEW.tenant_id,ARRAY[NEW.id]);
    END IF;
    NEW.account_id := public.entity_ledger_account(NEW.tenant_id,parent_account,NEW.name,NEW.is_group,NEW.currency,CASE WHEN NEW.partner_type='supplier' THEN 'supplier' ELSE 'customer' END);
  END IF;
  SELECT * INTO a FROM public.accounts WHERE id=NEW.account_id AND tenant_id=NEW.tenant_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'اختر حساباً من الشركة نفسها'; END IF;
  IF TG_OP='INSERT' THEN
    IF a.is_group IS DISTINCT FROM NEW.is_group THEN RAISE EXCEPTION 'نوع الحساب المرتبط لا يطابق البطاقة'; END IF;
  ELSIF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    IF a.is_group IS DISTINCT FROM NEW.is_group THEN RAISE EXCEPTION 'نوع الحساب المرتبط لا يطابق البطاقة'; END IF;
  END IF;
  cur := coalesce(nullif(NEW.currency,''),a.currency::text,base_cur);
  IF NOT NEW.is_group AND nullif(NEW.currency,'') IS NOT NULL AND a.currency::text<>NEW.currency THEN
 IF TG_OP='INSERT' OR NEW.account_id IS DISTINCT FROM OLD.account_id THEN RAISE EXCEPTION 'عملة الحساب المرتبط لا تطابق عملة البطاقة'; END IF;
 IF EXISTS(SELECT 1 FROM public.journal_lines WHERE account_id=a.id) THEN RAISE EXCEPTION 'لا يمكن تغيير عملة حساب له حركات؛ أنشئ بطاقة بالعملة الجديدة'; END IF;
 PERFORM set_config('app.partner_currency_sync',a.id::text,true);
 UPDATE public.accounts SET currency=NEW.currency::public.currency_code WHERE id=a.id AND tenant_id=NEW.tenant_id;
 PERFORM set_config('app.partner_currency_sync','',true);
 END IF;
  NEW.is_monetary := NOT NEW.is_group;
  IF NEW.is_monetary AND NOT a.is_monetary THEN UPDATE public.accounts SET is_monetary=true WHERE id=a.id AND tenant_id=NEW.tenant_id; END IF;
  NEW.auto_account := false; NEW.auto_parent_account_id := NULL;
  RETURN NEW;
END $$;


--
-- Name: partner_currency_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.partner_currency_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _pc text; _ec text; _pn text;
BEGIN
  IF NEW.partner_id IS NULL THEN RETURN NEW; END IF;
  SELECT NULLIF(currency, ''), name INTO _pc, _pn FROM partners WHERE id = NEW.partner_id;
  IF _pc IS NULL THEN RETURN NEW; END IF;
  SELECT currency::text INTO _ec FROM journal_entries WHERE id = NEW.entry_id;
  IF _ec IS DISTINCT FROM _pc THEN
    RAISE EXCEPTION 'الجهة "%" محددة بعملة % فقط، ولا يمكن تسجيل حركة لها بعملة %. اترك عملة البطاقة فارغة لتقبل كل العملات', _pn, _pc, _ec;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: partner_inquiry_after(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.partner_inquiry_after() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE l public.share_links;
BEGIN
  IF NEW.from_partner THEN
    SELECT * INTO l FROM public.share_links WHERE id = NEW.link_id;
    PERFORM public.notify_user(l.created_by, NEW.tenant_id, 'استفسار من ' || coalesce(NEW.author_name, 'شريك') || ' على ' || coalesce(l.label, 'مستند'), left(NEW.body, 200), 'inquiry', '/collab');
    PERFORM public.notify_tenant_admins(NEW.tenant_id, 'استفسار من ' || coalesce(NEW.author_name, 'شريك') || ' على ' || coalesce(l.label, 'مستند'), left(NEW.body, 200), 'inquiry', '/collab');
  END IF;
  RETURN NEW;
END $$;


--
-- Name: pos_document_cash(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.pos_document_cash() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE a uuid; BEGIN
 IF NEW.notes IN ('بيع نقطة البيع','شراء نقطة البيع','دفع نقدي - نقطة البيع') THEN
 IF auth.uid() IS NULL OR NEW.tenant_id IS DISTINCT FROM public.current_tenant_id() OR NOT(public.is_tenant_admin() OR public.has_perm('documents','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 IF NEW.created_by IS NOT NULL AND NEW.created_by<>auth.uid() THEN RAISE EXCEPTION 'زامن الفاتورة من حساب الكاشير نفسه'; END IF;
 NEW.created_by:=auth.uid(); a:=public.ensure_pos_drawer(auth.uid());
 IF a IS NOT NULL THEN NEW.account_id:=a; END IF; END IF; RETURN NEW; END $$;


--
-- Name: post_assembly(text, uuid, date, uuid, numeric, jsonb, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.post_assembly(_mode text, _warehouse uuid, _date date, _product uuid, _qty numeric, _components jsonb, _notes text, _to_warehouse uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t uuid := public.my_tenant_id(); c jsonb; pc numeric; total numeric := 0; weight numeric := 0; vid uuid; no int; ref text; comps jsonb := '[]'::jsonb; cq numeric; cost numeric;
  dest uuid := coalesce(_to_warehouse,_warehouse); src_acc uuid; dst_acc uuid; s record; e uuid; cur text;
BEGIN
  IF t IS NULL OR NOT (public.is_tenant_admin() OR public.has_perm('stock','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _mode NOT IN ('assemble','disassemble') THEN RAISE EXCEPTION 'نوع السند غير صالح'; END IF;
  IF coalesce(_qty,0) <= 0 THEN RAISE EXCEPTION 'أدخل كمية صحيحة'; END IF;
  IF NOT EXISTS(SELECT 1 FROM warehouses WHERE id=_warehouse AND tenant_id=t AND NOT is_group) THEN RAISE EXCEPTION 'اختر المستودع'; END IF;
  IF NOT EXISTS(SELECT 1 FROM warehouses WHERE id=dest AND tenant_id=t AND NOT is_group) THEN RAISE EXCEPTION 'اختر مستودع الاستلام'; END IF;
  IF NOT EXISTS(SELECT 1 FROM products WHERE id=_product AND tenant_id=t AND NOT is_group AND coalesce(item_type,'stock')<>'service') THEN RAISE EXCEPTION 'اختر المادة الرئيسية'; END IF;
  IF jsonb_typeof(_components)<>'array' OR jsonb_array_length(_components)=0 THEN RAISE EXCEPTION 'أضف مكوّناً واحداً على الأقل'; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(_components) LOOP
    cq := (c->>'qty')::numeric;
    IF coalesce(cq,0)<=0 OR (c->>'product_id')::uuid = _product THEN RAISE EXCEPTION 'بيانات المكوّنات غير صحيحة'; END IF;
    SELECT avg_cost INTO pc FROM products WHERE id=(c->>'product_id')::uuid AND tenant_id=t AND NOT is_group AND coalesce(item_type,'stock')<>'service';
    IF NOT FOUND THEN RAISE EXCEPTION 'مكوّن غير صالح'; END IF;
    weight := weight + cq * coalesce(pc,0);
  END LOOP;
  SELECT coalesce(max(voucher_no),0)+1 INTO no FROM assembly_vouchers WHERE tenant_id=t;
  ref := CASE WHEN _mode='assemble' THEN 'assembly' ELSE 'disassembly' END;
  IF _mode='assemble' THEN
    total := weight;
    FOR c IN SELECT * FROM jsonb_array_elements(_components) LOOP
      SELECT avg_cost INTO pc FROM products WHERE id=(c->>'product_id')::uuid;
      INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,reference)
      VALUES (t,(c->>'product_id')::uuid,_warehouse,_date,'out',(c->>'qty')::numeric,coalesce(pc,0),ref);
      comps := comps || jsonb_build_object('product_id',c->>'product_id','qty',(c->>'qty')::numeric,'unit_cost',coalesce(pc,0));
    END LOOP;
    INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,reference)
    VALUES (t,_product,dest,_date,'in',_qty,total/_qty,ref);
  ELSE
    SELECT coalesce(avg_cost,0)*_qty INTO total FROM products WHERE id=_product;
    INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,reference)
    VALUES (t,_product,_warehouse,_date,'out',_qty,total/_qty,ref);
    FOR c IN SELECT * FROM jsonb_array_elements(_components) LOOP
      cq := (c->>'qty')::numeric;
      SELECT coalesce(avg_cost,0) INTO pc FROM products WHERE id=(c->>'product_id')::uuid;
      cost := CASE WHEN weight>0 THEN total*(cq*pc/weight)/cq ELSE total/(SELECT sum((x->>'qty')::numeric) FROM jsonb_array_elements(_components) x) END;
      INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,reference)
      VALUES (t,(c->>'product_id')::uuid,dest,_date,'in',cq,round(cost,6),ref);
      comps := comps || jsonb_build_object('product_id',c->>'product_id','qty',cq,'unit_cost',round(cost,6));
    END LOOP;
  END IF;
  IF dest <> _warehouse AND total > 0 THEN
    SELECT * INTO s FROM tenant_settings WHERE tenant_id=t;
    SELECT coalesce(account_id,s.inventory_account_id) INTO src_acc FROM warehouses WHERE id=_warehouse;
    SELECT coalesce(account_id,s.inventory_account_id) INTO dst_acc FROM warehouses WHERE id=dest;
    IF src_acc IS NOT NULL AND dst_acc IS NOT NULL AND src_acc <> dst_acc THEN
      cur := coalesce(s.base_currency::text,'USD');
      INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,created_by)
      VALUES (t,0,_date,CASE WHEN _mode='assemble' THEN 'سند تجميع رقم ' ELSE 'سند فك رقم ' END || no || ' بين مستودعين',cur::public.currency_code,1,ref,auth.uid())
      RETURNING id INTO e;
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES
        (t,e,dst_acc,round(total,2),0),(t,e,src_acc,0,round(total,2));
    END IF;
  END IF;
  INSERT INTO assembly_vouchers(tenant_id,voucher_no,mode,voucher_date,warehouse_id,to_warehouse_id,product_id,qty,total_cost,components,notes,created_by,journal_entry_id)
  VALUES (t,no,_mode,_date,_warehouse,nullif(dest,_warehouse),_product,_qty,total,comps,nullif(_notes,''),auth.uid(),e) RETURNING id INTO vid;
  RETURN vid;
END $$;


--
-- Name: post_cost_document(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.post_cost_document(_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column

DECLARE d public.documents%rowtype; s public.tenant_settings%rowtype; l record; x jsonb; ch jsonb; e uuid; acc uuid; counter uuid; warehouse_acc uuid; gross numeric; base numeric; discounts numeric:=0; additions numeric:=0; dedicated numeric:=0; total numeric:=0; value numeric; share numeric; dd numeric; aa numeric; unit_cost numeric; rev boolean; incd boolean; inca boolean; signum int; parts jsonb:='[]'; costparts jsonb:='[]'; rawcost numeric; policy text;
BEGIN
 PERFORM set_config('app.posting','on',true);
 SELECT * INTO d FROM documents WHERE id=_id AND tenant_id=my_tenant_id() FOR UPDATE;
 IF NOT FOUND OR NOT (is_tenant_admin() OR has_perm('documents','create')) OR NOT can_see_branch(d.branch_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 IF d.status='posted' THEN RETURN d.journal_entry_id; END IF;
 SELECT * INTO s FROM tenant_settings WHERE tenant_id=d.tenant_id;
 policy:=coalesce(s.purchase_cost_policy,'net'); incd:=policy IN ('less_disc','net'); inca:=policy IN ('plus_add','net'); rev:=d.doc_type='purchase_return'; signum:=CASE WHEN rev THEN -1 ELSE 1 END;
 counter:=CASE WHEN d.doc_type='stock_in' THEN coalesce(d.account_id,s.inventory_adjust_account_id) WHEN d.doc_type='sale_return' THEN coalesce(d.partner_account_id,(SELECT account_id FROM partners WHERE id=d.partner_id AND tenant_id=d.tenant_id),s.customers_account_id) ELSE coalesce(d.partner_account_id,(SELECT account_id FROM partners WHERE id=d.partner_id AND tenant_id=d.tenant_id),s.suppliers_account_id) END;
 ch:=coalesce(d.charges,'[]');
 IF jsonb_array_length(ch)=0 THEN
   IF coalesce(d.discount_amount,0)>0 THEN ch:=ch||jsonb_build_array(jsonb_build_object('kind','discount','amount',d.discount_amount)); END IF;
   IF coalesce(d.freight_amount,0)>0 THEN ch:=ch||jsonb_build_array(jsonb_build_object('kind','add','amount',d.freight_amount)); END IF;
 END IF;
 SELECT coalesce(sum(qty*unit_price),0) INTO base FROM document_lines WHERE document_id=_id;
 IF base<=0 THEN RAISE EXCEPTION 'يجب أن يكون مبلغ البنود موجباً لتوزيع الحسميات والإضافات'; END IF;
 FOR l IN SELECT * FROM document_lines WHERE document_id=_id LOOP
   IF l.qty<=0 OR l.unit_price<0 OR coalesce(l.line_discount,0)<0 OR coalesce(l.line_addition,0)<0 THEN RAISE EXCEPTION 'تحقق من كمية وسعر وحسم وإضافة السطر'; END IF;
   IF coalesce(l.line_discount,0)>0 THEN ch:=ch||jsonb_build_array(jsonb_build_object('kind','discount','amount',l.line_discount,'exp_account_id',l.charge_accounts->>'discount','line_id',l.id)); END IF;
   IF coalesce(l.line_addition,0)>0 THEN ch:=ch||jsonb_build_array(jsonb_build_object('kind','add','amount',l.line_addition,'exp_account_id',l.charge_accounts->>'addition','account_id',l.charge_accounts->>'addition_credit','line_id',l.id)); END IF;
 END LOOP;
 FOR x IN SELECT * FROM jsonb_array_elements(ch) LOOP
   value:=coalesce((x->>'amount')::numeric,0); IF value<0 THEN RAISE EXCEPTION 'مبالغ الحسميات والإضافات لا يمكن أن تكون سالبة'; END IF; CONTINUE WHEN value=0;
   IF x->>'kind'='discount' THEN
     discounts:=discounts+value;
     IF NOT incd THEN
       acc:=coalesce(nullif(x->>'exp_account_id','')::uuid,s.purchase_discount_account_id);
       parts:=parts||jsonb_build_array(jsonb_build_object('account',acc,'value',-value,'note','حسم خارج الكلفة'));
     END IF;
   ELSE
     additions:=additions+value; dedicated:=dedicated+value;
     acc:=nullif(x->>'account_id','')::uuid;
     IF acc IS NULL THEN RAISE EXCEPTION 'حدد الحساب الدائن لكل إضافة داخل الفاتورة'; END IF;
     parts:=parts||jsonb_build_array(jsonb_build_object('account',acc,'value',-value,'note','الطرف المقابل للإضافة'));
     IF NOT inca THEN
       acc:=coalesce(nullif(x->>'exp_account_id','')::uuid,s.purchase_freight_account_id);
       parts:=parts||jsonb_build_array(jsonb_build_object('account',acc,'value',value,'note','مصروف إضافة خارج الكلفة'));
     END IF;
   END IF;
 END LOOP;
 total:=base-discounts+additions;
 IF total<0 THEN RAISE EXCEPTION 'الحسميات تتجاوز مبلغ الفاتورة'; END IF;
 FOR l IN SELECT dl.*,p.item_type,p.service_expense_account_id,p.service_account_id,p.avg_cost,p.last_purchase_price FROM document_lines dl LEFT JOIN products p ON p.id=dl.product_id AND p.tenant_id=d.tenant_id WHERE document_id=_id ORDER BY dl.id LOOP
   gross:=l.qty*l.unit_price; share:=gross/base; dd:=coalesce(l.line_discount,0); aa:=coalesce(l.line_addition,0);
   SELECT dd+coalesce(sum((x->>'amount')::numeric*share) FILTER (WHERE x->>'kind'='discount'),0), aa+coalesce(sum((x->>'amount')::numeric*share) FILTER (WHERE x->>'kind'<>'discount'),0) INTO dd,aa FROM jsonb_array_elements(ch) x WHERE x->>'line_id' IS NULL;
   value:=gross-CASE WHEN incd THEN dd ELSE 0 END+CASE WHEN inca THEN aa ELSE 0 END;
   IF value<0 THEN RAISE EXCEPTION 'حسم السطر أكبر من قيمته'; END IF;
   IF l.product_id IS NULL OR l.item_type='service' THEN
     acc:=coalesce(l.account_id,l.service_expense_account_id,l.service_account_id);
   ELSE
     SELECT coalesce(w.account_id,s.inventory_account_id) INTO warehouse_acc FROM warehouses w WHERE w.id=coalesce(l.warehouse_id,d.warehouse_id) AND w.tenant_id=d.tenant_id AND NOT w.is_group AND can_see_branch(w.branch_id);
     IF warehouse_acc IS NULL THEN RAISE EXCEPTION 'حدد مستودعاً صالحاً مرتبطاً بحساب المخزون'; END IF;
     acc:=warehouse_acc;
     unit_cost:=value/l.qty/coalesce(nullif(d.exchange_rate,0),1);
     IF d.doc_type='sale_return' THEN
       rawcost:=l.qty*coalesce(CASE WHEN s.cost_method='last' AND l.last_purchase_price>0 THEN l.last_purchase_price ELSE l.avg_cost END,0)*d.exchange_rate;
       costparts:=costparts||jsonb_build_array(jsonb_build_object('account',warehouse_acc,'value',rawcost,'note','مخزون مردود مبيع'),jsonb_build_object('account',s.cogs_account_id,'value',-rawcost,'note','عكس كلفة المبيعات'));
       unit_cost:=rawcost/l.qty/d.exchange_rate;
       acc:=coalesce(nullif(s.doc_type_accounts->>'sale_return','')::uuid,s.sales_account_id);
     END IF;
     INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,project_id,partner_id,document_id,reference,branch_id) VALUES(d.tenant_id,l.product_id,coalesce(l.warehouse_id,d.warehouse_id),d.doc_date,CASE WHEN rev THEN 'out' ELSE 'in' END,l.qty,unit_cost,d.project_id,d.partner_id,_id,d.doc_type,d.branch_id);
     IF d.doc_type='purchase' THEN UPDATE products SET purchase_price=round(unit_cost,4) WHERE id=l.product_id; END IF;
   END IF;
   parts:=parts||jsonb_build_array(jsonb_build_object('account',acc,'value',value,'note','قيمة بند الفاتورة'));
 END LOOP;
 parts:=parts||costparts||jsonb_build_array(jsonb_build_object('account',counter,'value',-(total-dedicated),'note','الطرف المقابل للفاتورة'));
 FOR x IN SELECT * FROM jsonb_array_elements(parts) LOOP
   IF NOT EXISTS(SELECT 1 FROM accounts WHERE id=(x->>'account')::uuid AND tenant_id=d.tenant_id AND NOT is_group AND nature<>'closing') THEN RAISE EXCEPTION 'حدد حساباً فرعياً صالحاً من الشركة والفرع للحسم أو الإضافة أو الفاتورة'; END IF;
 END LOOP;
 INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,document_id,created_by,branch_id) VALUES(d.tenant_id,0,d.doc_date,coalesce(d.notes,d.doc_type),d.currency,d.exchange_rate,d.doc_type,_id,auth.uid(),d.branch_id) RETURNING id INTO e;
 INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit,branch_id)
 SELECT d.tenant_id,e,(x->>'account')::uuid,x->>'note',greatest(round((x->>'value')::numeric*signum,4),0),greatest(-round((x->>'value')::numeric*signum,4),0),d.branch_id FROM jsonb_array_elements(parts) x WHERE (x->>'value')::numeric<>0;
 SELECT round(sum(debit-credit),4) INTO value FROM journal_lines WHERE entry_id=e;
 IF abs(value)>0.01 THEN RAISE EXCEPTION 'تعذر موازنة توزيع الحسميات والإضافات'; END IF;
 IF value<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit,branch_id,description) VALUES(d.tenant_id,e,counter,greatest(-value,0),greatest(value,0),d.branch_id,'فرق تقريب التوزيع'); END IF;
 UPDATE documents SET status='posted',journal_entry_id=e,amount=total WHERE id=_id;
 RETURN e;
END $$;


--
-- Name: post_doc_charges(uuid, uuid, jsonb, boolean, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.post_doc_charges(_t uuid, _e uuid, _ch jsonb, _sale boolean, _disc_acc uuid, _add_acc uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE cj jsonb; acc uuid; am numeric; isd boolean; lbl text;
BEGIN
  FOR cj IN SELECT * FROM jsonb_array_elements(coalesce(_ch,'[]'::jsonb)) LOOP
    am := greatest(coalesce((cj->>'amount')::numeric,0),0);
    CONTINUE WHEN am=0;
    isd := cj->>'kind'='discount';
    acc := coalesce(nullif(cj->>'account_id','')::uuid, CASE WHEN isd THEN _disc_acc ELSE _add_acc END);
    IF acc IS NULL THEN
      RAISE EXCEPTION '%', CASE WHEN isd THEN 'حدد حساب الحسم في الربط المحاسبي بالإعدادات' ELSE 'حدد حساب الإضافات (مصاريف النقل) في الربط المحاسبي بالإعدادات' END;
    END IF;
    lbl := coalesce(nullif(cj->>'note',''), CASE WHEN isd THEN 'حسم' ELSE 'إضافة' END);
    INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit)
      VALUES (_t,_e,acc,lbl, CASE WHEN isd = _sale THEN am ELSE 0 END, CASE WHEN isd = _sale THEN 0 ELSE am END);
  END LOOP;
END $$;


--
-- Name: post_document(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.post_document(_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
END $$;


--
-- Name: post_document_core(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.post_document_core(_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE d record; s record; l record; inv record; e uuid; amt numeric:=0; cost numeric:=0; pacc uuid; cash uuid; c numeric; pamt numeric; diff numeric:=0; disc numeric:=0; fr numeric:=0; net numeric; ch jsonb; cj jsonb; base0 numeric:=0; alloc numeric:=0; uc numeric; lv numeric; chacc jsonb:='[]'::jsonb; bad int; pr record; svc numeric:=0; sv numeric; svj jsonb:='{}'::jsonb; rec_c record; sacc uuid; bk text; bv numeric; pol text; newp boolean:=false; sbase numeric:=0; d0 numeric:=0; a0 numeric:=0; a0acc numeric:=0; lsh numeric; ldi numeric; lad numeric; wacc uuid; invj jsonb:='{}'::jsonb; excdisc numeric:=0; excadd numeric:=0;
BEGIN
  PERFORM set_config('app.posting','on',true);
  SELECT * INTO d FROM documents WHERE id=_id AND tenant_id=my_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'المستند غير موجود'; END IF;
  IF NOT (is_tenant_admin() OR has_perm('documents','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF d.status='posted' THEN RETURN d.journal_entry_id; END IF;
  -- PERIOD_INVENTORY_V1: opening adds stock; ending is a valuation, never a receipt.
  IF d.doc_type IN ('opening_inventory','closing_inventory') THEN
    IF NOT public.can_see_branch(d.branch_id) THEN RAISE EXCEPTION 'المستند خارج نطاق الفرع'; END IF;
    SELECT * INTO s FROM public.tenant_settings WHERE tenant_id=d.tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'أكمل الربط المحاسبي في الإعدادات'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.document_lines WHERE document_id=_id) THEN RAISE EXCEPTION 'أضف بنود البضاعة'; END IF;
    IF EXISTS(SELECT 1 FROM public.document_lines dl WHERE dl.document_id=_id AND (dl.qty<=0 OR dl.unit_price<0 OR NOT EXISTS(SELECT 1 FROM public.products p WHERE p.id=dl.product_id AND p.tenant_id=d.tenant_id AND NOT p.is_group) OR NOT EXISTS(SELECT 1 FROM public.warehouses w WHERE w.id=coalesce(dl.warehouse_id,d.warehouse_id) AND w.tenant_id=d.tenant_id AND NOT w.is_group AND public.can_see_branch(w.branch_id)))) THEN RAISE EXCEPTION 'حدد مادة فرعية ومستودعاً صالحاً وكمية موجبة لكل بند'; END IF;
    SELECT sum(qty*unit_price) INTO amt FROM public.document_lines WHERE document_id=_id;
    IF d.doc_type='opening_inventory' THEN
      -- OPENING_CAPITAL_V1: debit each warehouse inventory account, credit capital; no manual counter account.
      -- CAPITAL_SETTING_V1: configured capital account first
      sacc := coalesce(s.capital_account_id, d.account_id);
      IF sacc IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=sacc AND tenant_id=d.tenant_id AND NOT is_group AND nature<>'closing') THEN
        SELECT a.id INTO sacc FROM public.accounts a WHERE a.tenant_id=d.tenant_id AND NOT a.is_group AND a.nature<>'closing'
          AND (a.name LIKE '%رأس المال%' OR a.name LIKE '%راس المال%' OR a.name ILIKE '%capital%')
          ORDER BY (a.nature::text='equity') DESC, a.code LIMIT 1;
      END IF;
      IF sacc IS NULL THEN RAISE EXCEPTION 'أضف حساب «رأس المال» (حساب فرعي) في دليل الحسابات ليُرحّل قيد بضاعة أول المدة'; END IF;
      -- SHARED_OPENING_V1: all opening inventory invoices feed the single opening entry (base currency).
      e := public.ensure_opening_entry(d.tenant_id, d.doc_date, d.branch_id);
      IF amt>0 THEN
        FOR inv IN SELECT coalesce(w.account_id, s.inventory_account_id) acc, sum(dl.qty*dl.unit_price) v
          FROM public.document_lines dl JOIN public.warehouses w ON w.id=coalesce(dl.warehouse_id,d.warehouse_id)
          WHERE dl.document_id=_id GROUP BY 1 LOOP
          IF inv.acc IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=inv.acc AND tenant_id=d.tenant_id AND NOT is_group) THEN RAISE EXCEPTION 'اربط المستودع بحساب مخزون أو حدد حساب المخزون في الربط المحاسبي'; END IF;
          IF inv.acc=sacc THEN RAISE EXCEPTION 'حساب المستودع لا يمكن أن يكون حساب رأس المال'; END IF;
          IF inv.v>0 THEN INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,branch_id,source_document_id,description) VALUES(d.tenant_id,e,inv.acc,round(inv.v/coalesce(nullif(d.exchange_rate,0),1),4),0,d.branch_id,_id,'بضاعة أول المدة رقم '||d.doc_no); END IF;
        END LOOP;
        SELECT id INTO inv FROM public.journal_lines WHERE entry_id=e AND account_id=sacc AND source_document_id IS NULL AND debit=0 ORDER BY credit DESC LIMIT 1;
        IF inv.id IS NOT NULL THEN
          UPDATE public.journal_lines SET credit=credit+round(amt/coalesce(nullif(d.exchange_rate,0),1),4) WHERE id=inv.id;
        ELSE
          INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,branch_id,description) VALUES(d.tenant_id,e,sacc,0,round(amt/coalesce(nullif(d.exchange_rate,0),1),4),d.branch_id,'رأس المال');
        END IF;
      END IF;
    ELSIF s.inventory_method='periodic' THEN
      IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=s.inventory_account_id AND tenant_id=d.tenant_id AND NOT is_group AND nature<>'closing') THEN RAISE EXCEPTION 'حدد حساب مخزون فعلي في الربط المحاسبي'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=d.account_id AND tenant_id=d.tenant_id AND NOT is_group AND nature<>'closing') OR d.account_id=s.inventory_account_id THEN RAISE EXCEPTION 'اختر الحساب المقابل للبضاعة، مختلفاً عن حساب المخزون'; END IF;
      INSERT INTO public.journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,document_id,created_by,branch_id) VALUES(d.tenant_id,0,d.doc_date,coalesce(d.notes,CASE WHEN d.doc_type='opening_inventory' THEN 'بضاعة أول المدة' ELSE 'بضاعة آخر المدة' END),d.currency,d.exchange_rate,d.doc_type,_id,auth.uid(),d.branch_id) RETURNING id INTO e;
      IF amt>0 THEN INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,branch_id) VALUES(d.tenant_id,e,s.inventory_account_id,amt,0,d.branch_id),(d.tenant_id,e,d.account_id,0,amt,d.branch_id); END IF;
    END IF;
    IF d.doc_type='opening_inventory' THEN
      INSERT INTO public.stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,document_id,reference,branch_id)
      SELECT d.tenant_id,dl.product_id,coalesce(dl.warehouse_id,d.warehouse_id),d.doc_date,'in',dl.qty,dl.unit_price/d.exchange_rate,_id,'opening_inventory',d.branch_id FROM public.document_lines dl WHERE dl.document_id=_id;
    END IF;
    UPDATE public.documents SET status='posted',journal_entry_id=e,amount=amt WHERE id=_id;
    RETURN e;
  END IF;
  SELECT * INTO s FROM tenant_settings WHERE tenant_id=d.tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'أكمل الربط المحاسبي في الإعدادات أولاً'; END IF;
  -- COST_ACCOUNTS_V2: continuous cost rules are authoritative for all inventory invoice paths.
  IF s.inventory_method IS DISTINCT FROM 'periodic' AND d.doc_type IN ('purchase','purchase_return','sale_return','stock_in') THEN RETURN public.post_cost_document(_id); END IF;
  SELECT account_id INTO pacc FROM partners WHERE id=d.partner_id AND tenant_id=d.tenant_id;
 pacc := coalesce(d.partner_account_id,pacc);
 IF d.partner_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=d.partner_account_id AND tenant_id=d.tenant_id AND NOT is_group AND nature<>'closing') THEN RAISE EXCEPTION 'اختر حساباً فعلياً من الشركة نفسها'; END IF;
 IF s.inventory_method='periodic' THEN
 IF d.doc_type IN ('purchase','purchase_return') AND s.purchases_account_id IS NULL AND coalesce(s.doc_type_accounts->>d.doc_type,'')='' THEN RAISE EXCEPTION 'حدد حساب المشتريات للجرد الدوري في الربط المحاسبي'; END IF;
 s.inventory_account_id := s.purchases_account_id; END IF;
  -- Per document type main account (settings) overrides the general link.
  IF coalesce(s.doc_type_accounts->>d.doc_type, '') <> '' THEN
    IF d.doc_type IN ('sale','sale_return') THEN s.sales_account_id := (s.doc_type_accounts->>d.doc_type)::uuid;
    ELSIF d.doc_type IN ('purchase','purchase_return') THEN s.inventory_account_id := (s.doc_type_accounts->>d.doc_type)::uuid;
    ELSIF d.doc_type IN ('receipt','payment') THEN s.cash_account_id := (s.doc_type_accounts->>d.doc_type)::uuid;
    END IF;
  END IF;
  cash := coalesce(d.cash_account_id,d.account_id,s.cash_account_id);
  IF s.inventory_account_id IS NULL THEN SELECT w.account_id INTO s.inventory_account_id FROM public.warehouses w WHERE w.id=d.warehouse_id AND w.tenant_id=d.tenant_id; END IF;
  IF s.inventory_account_id IS NULL THEN SELECT w.account_id INTO s.inventory_account_id FROM public.document_lines dl JOIN public.warehouses w ON w.id=dl.warehouse_id WHERE dl.document_id=_id AND w.account_id IS NOT NULL LIMIT 1; END IF;
 IF cash IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=cash AND tenant_id=d.tenant_id AND NOT is_group AND nature<>'closing') THEN RAISE EXCEPTION 'اختر صندوقاً فعلياً من الشركة نفسها'; END IF;
  IF d.doc_type IN ('sale','purchase') THEN
    ch := coalesce(d.charges,'[]'::jsonb);
    IF jsonb_array_length(ch)=0 THEN
      ch := '[]'::jsonb;
      IF coalesce(d.discount_amount,0)>0 THEN ch := ch || jsonb_build_array(jsonb_build_object('kind','discount','amount',d.discount_amount)); END IF;
      IF coalesce(d.freight_amount,0)>0 THEN ch := ch || jsonb_build_array(jsonb_build_object('kind','add','amount',d.freight_amount)); END IF;
    END IF;
    FOR cj IN SELECT * FROM jsonb_array_elements(ch) LOOP
      IF cj->>'kind'='discount' THEN disc := disc + greatest(coalesce((cj->>'amount')::numeric,0),0);
      ELSE fr := fr + greatest(coalesce((cj->>'amount')::numeric,0),0); END IF;
    END LOOP;
  ELSE ch := '[]'::jsonb;
  END IF;
  IF d.doc_type='purchase' THEN
    SELECT coalesce(sum(qty*unit_price - coalesce(line_discount,0) + coalesce(line_addition,0)),0) INTO base0 FROM document_lines WHERE document_id=_id;
    SELECT coalesce(sum(CASE WHEN x->>'kind'='discount' THEN -1 ELSE 1 END * greatest(coalesce((x->>'amount')::numeric,0),0)),0) INTO alloc
      FROM jsonb_array_elements(ch) x WHERE nullif(x->>'account_id','') IS NULL;
    SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO chacc FROM jsonb_array_elements(ch) x WHERE nullif(x->>'account_id','') IS NOT NULL;
  ELSE chacc := ch;
  END IF;
  -- PURCHASE_COST_POLICY_V1: continuous inventory posts each line to its warehouse account; invoice discounts/additions allocate by line value.
  newp := d.doc_type IN ('purchase','purchase_return') AND s.inventory_method<>'periodic' AND coalesce(s.doc_type_accounts->>d.doc_type,'')='';
  pol := coalesce(s.purchase_cost_policy,'net');
  IF newp AND d.doc_type='purchase' THEN
    SELECT coalesce(sum(dl.qty*dl.unit_price),0) INTO sbase FROM document_lines dl JOIN products p ON p.id=dl.product_id WHERE dl.document_id=_id AND p.item_type IS DISTINCT FROM 'service';
    IF sbase<=0 THEN newp:=false; ELSE
      SELECT coalesce(sum(CASE WHEN x->>'kind'='discount' THEN greatest(coalesce((x->>'amount')::numeric,0),0) ELSE 0 END),0),
             coalesce(sum(CASE WHEN x->>'kind'<>'discount' THEN greatest(coalesce((x->>'amount')::numeric,0),0) ELSE 0 END),0),
             coalesce(sum(CASE WHEN x->>'kind'<>'discount' AND nullif(x->>'account_id','') IS NOT NULL THEN greatest(coalesce((x->>'amount')::numeric,0),0) ELSE 0 END),0)
        INTO d0,a0,a0acc FROM jsonb_array_elements(ch) x;
    END IF;
  END IF;
  IF d.doc_type IN ('sale','purchase','transfer','stock_in','stock_out','sale_return','purchase_return') THEN
    IF EXISTS (SELECT 1 FROM public.document_lines dl WHERE dl.document_id=_id AND dl.product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products sp WHERE sp.id=dl.product_id AND sp.item_type='service') AND NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id=coalesce(dl.warehouse_id,d.warehouse_id) AND w.tenant_id=d.tenant_id AND NOT w.is_group)) THEN RAISE EXCEPTION 'حدد المستودع لكل سطر مخزون من مستودعات الشركة'; END IF;
    FOR l IN SELECT * FROM document_lines WHERE document_id=_id LOOP
      amt := amt + l.qty*l.unit_price - coalesce(l.line_discount,0) + coalesce(l.line_addition,0);
      IF l.product_id IS NULL THEN
        IF newp THEN
          wacc := s.inventory_account_id;
          IF wacc IS NULL THEN RAISE EXCEPTION 'حدد حساب المخزون في الربط المحاسبي'; END IF;
          invj := jsonb_set(invj, ARRAY[wacc::text], to_jsonb(coalesce((invj->>wacc::text)::numeric,0)+l.qty*l.unit_price-coalesce(l.line_discount,0)+coalesce(l.line_addition,0)));
        END IF;
        CONTINUE;
      END IF;
      SELECT item_type,service_account_id,service_expense_account_id,default_warehouse_id INTO pr FROM products WHERE id=l.product_id;
      IF pr.item_type='service' THEN
        sv := l.qty*l.unit_price - coalesce(l.line_discount,0) + coalesce(l.line_addition,0);
        IF d.doc_type IN ('sale','sale_return') THEN sacc := pr.service_account_id;
        ELSIF d.doc_type IN ('purchase','purchase_return') THEN sacc := coalesce(pr.service_expense_account_id,pr.service_account_id);
        ELSE sacc := NULL; END IF;
        IF sacc IS NOT NULL THEN
          svc := svc + sv;
          svj := jsonb_set(svj, ARRAY[sacc::text], to_jsonb(coalesce((svj->>sacc::text)::numeric,0)+sv));
        END IF;
        IF d.doc_type='sale' THEN
          FOR rec_c IN SELECT r.component_product_id cp, r.qty*l.qty need, CASE WHEN s.cost_method='last' AND cpp.last_purchase_price>0 THEN cpp.last_purchase_price ELSE cpp.avg_cost END cc, cpp.default_warehouse_id cw
              FROM product_recipes r JOIN products cpp ON cpp.id=r.component_product_id WHERE r.product_id=l.product_id AND r.tenant_id=d.tenant_id LOOP
            IF coalesce(l.warehouse_id,d.warehouse_id,rec_c.cw) IS NULL THEN RAISE EXCEPTION 'حدد مستودعاً لمستلزمات الخدمة'; END IF;
            cost := cost + rec_c.need*coalesce(rec_c.cc,0);
            PERFORM set_config('app.recipe_consuming','1',true);
            INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,project_id,partner_id,document_id,reference)
              VALUES (d.tenant_id,rec_c.cp,coalesce(l.warehouse_id,d.warehouse_id,rec_c.cw),d.doc_date,'out',rec_c.need,coalesce(rec_c.cc,0),d.project_id,d.partner_id,_id,'service_bom');
            PERFORM set_config('app.recipe_consuming','',true);
          END LOOP;
        END IF;
        CONTINUE;
      END IF;
      SELECT CASE WHEN s.cost_method='last' AND last_purchase_price>0 THEN last_purchase_price ELSE avg_cost END INTO c FROM products WHERE id=l.product_id;
      c := coalesce(c,0);
      IF d.doc_type IN ('stock_out','transfer') AND coalesce(l.unit_price,0)>0 THEN c := l.unit_price/coalesce(nullif(d.exchange_rate,0),1); END IF;
      IF d.doc_type IN ('sale','stock_out','transfer') THEN
        cost := cost + l.qty*c;
        INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,project_id,partner_id,document_id,reference)
          VALUES (d.tenant_id,l.product_id,coalesce(l.warehouse_id,d.warehouse_id),d.doc_date,'out',l.qty,c,d.project_id,d.partner_id,_id,d.doc_type);
        IF d.doc_type='transfer' THEN
          INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,document_id,reference)
            VALUES (d.tenant_id,l.product_id,d.to_warehouse_id,d.doc_date,'in',l.qty,c,_id,'transfer');
          SELECT account_id INTO wacc FROM warehouses WHERE id=d.to_warehouse_id;
          IF wacc IS NOT NULL THEN svj := jsonb_set(svj, ARRAY[wacc::text], to_jsonb(coalesce((svj->>wacc::text)::numeric,0)+l.qty*c)); END IF;
          SELECT account_id INTO wacc FROM warehouses WHERE id=coalesce(l.warehouse_id,d.warehouse_id);
          IF wacc IS NOT NULL THEN svj := jsonb_set(svj, ARRAY[wacc::text], to_jsonb(coalesce((svj->>wacc::text)::numeric,0)-l.qty*c)); END IF;
        END IF;
      ELSIF d.doc_type='sale_return' THEN
        cost := cost + l.qty*c;
        INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,partner_id,document_id,reference)
          VALUES (d.tenant_id,l.product_id,coalesce(l.warehouse_id,d.warehouse_id),d.doc_date,'in',l.qty,c,d.partner_id,_id,'sale_return');
      ELSIF d.doc_type='purchase_return' THEN
        INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,partner_id,document_id,reference)
          VALUES (d.tenant_id,l.product_id,coalesce(l.warehouse_id,d.warehouse_id),d.doc_date,'out',l.qty,l.unit_price/coalesce(nullif(d.exchange_rate,0),1),d.partner_id,_id,'purchase_return');
        IF newp THEN
          SELECT coalesce(w.account_id,s.inventory_account_id) INTO wacc FROM warehouses w WHERE w.id=coalesce(l.warehouse_id,d.warehouse_id);
          IF wacc IS NULL THEN RAISE EXCEPTION 'اربط المستودع بحساب مخزون أو حدد حساب المخزون في الربط المحاسبي'; END IF;
          invj := jsonb_set(invj, ARRAY[wacc::text], to_jsonb(coalesce((invj->>wacc::text)::numeric,0)+l.qty*l.unit_price-coalesce(l.line_discount,0)+coalesce(l.line_addition,0)));
        END IF;
      ELSE
        lv := l.qty*l.unit_price - coalesce(l.line_discount,0) + coalesce(l.line_addition,0);
        uc := CASE WHEN d.doc_type='purchase' AND l.qty<>0 THEN (lv + CASE WHEN base0<>0 THEN alloc*lv/base0 ELSE 0 END)/l.qty ELSE l.unit_price END / coalesce(nullif(d.exchange_rate,0),1);
        IF newp AND d.doc_type='purchase' THEN
          lsh := l.qty*l.unit_price/sbase;
          ldi := coalesce(l.line_discount,0) + d0*lsh;
          lad := coalesce(l.line_addition,0) + a0*lsh;
          lv := l.qty*l.unit_price;
          IF pol IN ('less_disc','net') THEN lv := lv - ldi; ELSE excdisc := excdisc + ldi; END IF;
          IF pol IN ('plus_add','net') THEN lv := lv + lad; ELSE excadd := excadd + lad; END IF;
          uc := CASE WHEN l.qty<>0 THEN lv/l.qty ELSE 0 END / coalesce(nullif(d.exchange_rate,0),1);
          SELECT coalesce(w.account_id,s.inventory_account_id) INTO wacc FROM warehouses w WHERE w.id=coalesce(l.warehouse_id,d.warehouse_id);
          IF wacc IS NULL THEN RAISE EXCEPTION 'اربط المستودع بحساب مخزون أو حدد حساب المخزون في الربط المحاسبي'; END IF;
          invj := jsonb_set(invj, ARRAY[wacc::text], to_jsonb(coalesce((invj->>wacc::text)::numeric,0)+lv));
        END IF;
        INSERT INTO stock_moves(tenant_id,product_id,warehouse_id,move_date,direction,qty,unit_cost,project_id,partner_id,document_id,reference)
          VALUES (d.tenant_id,l.product_id,coalesce(l.warehouse_id,d.warehouse_id),d.doc_date,'in',l.qty,uc,d.project_id,d.partner_id,_id,d.doc_type);
        IF d.doc_type='purchase' AND uc>0 THEN
          UPDATE products SET purchase_price=round(uc,4) WHERE id=l.product_id AND purchase_price IS DISTINCT FROM round(uc,4);
        END IF;
      END IF;
    END LOOP;
  ELSE
    amt := d.amount;
  END IF;
  cost := round(cost*coalesce(nullif(d.exchange_rate,0),1),4);
  net := amt - disc + fr;
  IF d.doc_type <> 'transfer' THEN
    INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,document_id,created_by)
      VALUES (d.tenant_id,0,d.doc_date,coalesce(d.notes,d.doc_type),d.currency,d.exchange_rate,d.doc_type,_id,auth.uid()) RETURNING id INTO e;
    IF d.doc_type='sale' THEN
      pacc := coalesce(pacc,s.customers_account_id,cash);
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,description,debit,credit)
      SELECT * FROM (VALUES
        (d.tenant_id,e,pacc,d.partner_id,NULL::text,net,0::numeric),
        (d.tenant_id,e,s.sales_account_id,NULL::uuid,NULL::text,0::numeric,amt-svc)
      ) v(t,en,a,p,ds,db,cr) WHERE v.db<>0 OR v.cr<>0;
      FOR bk,bv IN SELECT key,value::numeric FROM jsonb_each_text(svj) LOOP
        IF bv<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES (d.tenant_id,e,bk::uuid,0,bv); END IF;
      END LOOP;
      PERFORM public.post_doc_charges(d.tenant_id,e,ch,true,s.sales_discount_account_id,s.sales_freight_account_id);
      IF cost>0 AND s.inventory_method<>'periodic' THEN
        -- SALE_COGS_PER_WAREHOUSE_V1: credit each line warehouse's inventory account.
        lv := 0;
        FOR inv IN SELECT coalesce(w.account_id,s.inventory_account_id) acc, round(sum(m.qty*m.unit_cost)*coalesce(nullif(d.exchange_rate,0),1),4) v
          FROM stock_moves m LEFT JOIN warehouses w ON w.id=m.warehouse_id
          WHERE m.document_id=_id AND m.direction='out' GROUP BY 1 LOOP
          IF inv.acc IS NULL THEN RAISE EXCEPTION 'اربط المستودع بحساب مخزون أو حدد حساب المخزون في الربط المحاسبي'; END IF;
          IF inv.v<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES (d.tenant_id,e,inv.acc,0,inv.v); lv := lv + inv.v; END IF;
        END LOOP;
        IF lv<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES (d.tenant_id,e,s.cogs_account_id,lv,0); END IF;
      END IF;
    ELSIF d.doc_type='sale_return' THEN
      pacc := coalesce(pacc,s.customers_account_id,cash);
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,debit,credit) VALUES
        (d.tenant_id,e,s.sales_account_id,NULL,amt-svc,0),(d.tenant_id,e,pacc,d.partner_id,0,amt);
      FOR bk,bv IN SELECT key,value::numeric FROM jsonb_each_text(svj) LOOP IF bv<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES (d.tenant_id,e,bk::uuid,bv,0); END IF; END LOOP;
      IF cost>0 AND s.inventory_method<>'periodic' THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES
        (d.tenant_id,e,s.inventory_account_id,cost,0),(d.tenant_id,e,s.cogs_account_id,0,cost); END IF;
    ELSIF d.doc_type='purchase' AND newp THEN
      pacc := coalesce(pacc,s.suppliers_account_id,cash);
      FOR bk,bv IN SELECT key,value::numeric FROM jsonb_each_text(invj) LOOP
        IF round(bv,4)<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit) VALUES (d.tenant_id,e,bk::uuid,'مخزون فاتورة شراء '||d.doc_no,round(bv,4),0); END IF;
      END LOOP;
      FOR bk,bv IN SELECT key,value::numeric FROM jsonb_each_text(svj) LOOP
        IF bv<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES (d.tenant_id,e,bk::uuid,bv,0); END IF;
      END LOOP;
      -- CHARGE_EXP_ACCOUNT_V1: a charge's exp_account_id overrides the settings account for its excluded part.
      FOR cj IN SELECT * FROM jsonb_array_elements(ch) LOOP
        IF nullif(cj->>'exp_account_id','') IS NOT NULL AND greatest(coalesce((cj->>'amount')::numeric,0),0)>0 THEN
          IF cj->>'kind'='discount' AND pol IN ('price','plus_add') THEN
            INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit) VALUES (d.tenant_id,e,(cj->>'exp_account_id')::uuid,coalesce(nullif(cj->>'note',''),'حسم شراء'),0,round((cj->>'amount')::numeric,4));
            excdisc := excdisc - (cj->>'amount')::numeric;
          ELSIF cj->>'kind'<>'discount' AND pol IN ('price','less_disc') THEN
            INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit) VALUES (d.tenant_id,e,(cj->>'exp_account_id')::uuid,coalesce(nullif(cj->>'note',''),'إضافة شراء'),round((cj->>'amount')::numeric,4),0);
            excadd := excadd - (cj->>'amount')::numeric;
          END IF;
        END IF;
      END LOOP;
      IF round(excadd,4)<>0 THEN
        IF s.purchase_freight_account_id IS NULL THEN RAISE EXCEPTION 'حدد حساب مصاريف الشراء (الإضافات) في الربط المحاسبي'; END IF;
        INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit) VALUES (d.tenant_id,e,s.purchase_freight_account_id,'إضافات شراء خارج الكلفة',round(excadd,4),0);
      END IF;
      IF round(excdisc,4)<>0 THEN
        IF s.purchase_discount_account_id IS NULL THEN RAISE EXCEPTION 'حدد حساب الحسم على المشتريات في الربط المحاسبي'; END IF;
        INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit) VALUES (d.tenant_id,e,s.purchase_discount_account_id,'حسم شراء خارج الكلفة',0,round(excdisc,4));
      END IF;
      FOR cj IN SELECT * FROM jsonb_array_elements(ch) LOOP
        IF cj->>'kind'<>'discount' AND nullif(cj->>'account_id','') IS NOT NULL AND greatest(coalesce((cj->>'amount')::numeric,0),0)>0 THEN
          INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit) VALUES (d.tenant_id,e,(cj->>'account_id')::uuid,coalesce(nullif(cj->>'note',''),'إضافة'),0,(cj->>'amount')::numeric);
        END IF;
      END LOOP;
      pamt := amt - d0 + a0 - a0acc;
      IF pamt<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,debit,credit) VALUES (d.tenant_id,e,pacc,d.partner_id,0,pamt); END IF;
    ELSIF d.doc_type='purchase_return' AND newp THEN
      pacc := coalesce(pacc,s.suppliers_account_id,cash);
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,debit,credit) VALUES (d.tenant_id,e,pacc,d.partner_id,amt,0);
      FOR bk,bv IN SELECT key,value::numeric FROM jsonb_each_text(invj) LOOP
        IF round(bv,4)<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit) VALUES (d.tenant_id,e,bk::uuid,'مخزون مردود شراء '||d.doc_no,0,round(bv,4)); END IF;
      END LOOP;
      FOR bk,bv IN SELECT key,value::numeric FROM jsonb_each_text(svj) LOOP IF bv<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES (d.tenant_id,e,bk::uuid,0,bv); END IF; END LOOP;
    ELSIF d.doc_type='purchase' THEN
      pacc := coalesce(pacc,s.suppliers_account_id,cash);
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,description,debit,credit)
      SELECT * FROM (VALUES
        (d.tenant_id,e,s.inventory_account_id,NULL::uuid,NULL::text,amt-svc+alloc,0::numeric),
        (d.tenant_id,e,pacc,d.partner_id,NULL::text,0::numeric,net)
      ) v(t,en,a,p,ds,db,cr) WHERE v.db<>0 OR v.cr<>0;
      FOR bk,bv IN SELECT key,value::numeric FROM jsonb_each_text(svj) LOOP
        IF bv<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES (d.tenant_id,e,bk::uuid,bv,0); END IF;
      END LOOP;
      PERFORM public.post_doc_charges(d.tenant_id,e,chacc,false,s.purchase_discount_account_id,coalesce(s.purchase_freight_account_id,s.inventory_account_id));
    ELSIF d.doc_type='purchase_return' THEN
      pacc := coalesce(pacc,s.suppliers_account_id,cash);
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,debit,credit) VALUES
        (d.tenant_id,e,pacc,d.partner_id,amt,0),(d.tenant_id,e,s.inventory_account_id,NULL,0,amt-svc);
      FOR bk,bv IN SELECT key,value::numeric FROM jsonb_each_text(svj) LOOP IF bv<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES (d.tenant_id,e,bk::uuid,0,bv); END IF; END LOOP;
    ELSIF d.doc_type IN ('receipt','payment') THEN
      pacc := coalesce(pacc, CASE WHEN d.doc_type='receipt' THEN s.customers_account_id ELSE s.suppliers_account_id END);
      pamt := amt;
      IF d.settles_document_id IS NOT NULL THEN
        SELECT currency, exchange_rate INTO inv FROM documents WHERE id=d.settles_document_id;
        IF FOUND AND inv.currency=d.currency AND coalesce(inv.exchange_rate,0)>0 AND inv.exchange_rate<>d.exchange_rate THEN
          pamt := round(amt*d.exchange_rate/inv.exchange_rate, 2);
          diff := pamt - amt;
          IF diff<>0 AND (coalesce(s.fx_gain_account_id,s.fx_account_id) IS NULL OR coalesce(s.fx_loss_account_id,s.fx_account_id) IS NULL) THEN
            RAISE EXCEPTION 'حدد «حساب أرباح فروق الصرف» و«حساب خسائر فروق الصرف» في الربط المحاسبي بالإعدادات';
          END IF;
        END IF;
      END IF;
      IF d.doc_type='receipt' THEN
        INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,project_id,description,debit,credit)
        SELECT * FROM (VALUES
          (d.tenant_id,e,cash,NULL::uuid,NULL::uuid,NULL::text,amt,0::numeric),
          (d.tenant_id,e,pacc,d.partner_id,d.project_id,NULL::text,0::numeric,pamt),
          (d.tenant_id,e,coalesce(s.fx_loss_account_id,s.fx_account_id),NULL::uuid,NULL::uuid,'خسارة فرق صرف'::text,greatest(diff,0),0::numeric),
          (d.tenant_id,e,coalesce(s.fx_gain_account_id,s.fx_account_id),NULL::uuid,NULL::uuid,'ربح فرق صرف'::text,0::numeric,greatest(-diff,0))
        ) v(t,en,a,p,pr,ds,db,cr) WHERE v.db<>0 OR v.cr<>0;
      ELSE
        INSERT INTO journal_lines(tenant_id,entry_id,account_id,partner_id,project_id,description,debit,credit)
        SELECT * FROM (VALUES
          (d.tenant_id,e,pacc,d.partner_id,d.project_id,NULL::text,pamt,0::numeric),
          (d.tenant_id,e,cash,NULL::uuid,NULL::uuid,NULL::text,0::numeric,amt),
          (d.tenant_id,e,coalesce(s.fx_loss_account_id,s.fx_account_id),NULL::uuid,NULL::uuid,'خسارة فرق صرف'::text,greatest(diff,0),0::numeric),
          (d.tenant_id,e,coalesce(s.fx_gain_account_id,s.fx_account_id),NULL::uuid,NULL::uuid,'ربح فرق صرف'::text,0::numeric,greatest(diff,0))
        ) v(t,en,a,p,pr,ds,db,cr) WHERE v.db<>0 OR v.cr<>0;
      END IF;
    ELSIF d.doc_type='stock_in' THEN
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit) VALUES
        (d.tenant_id,e,s.inventory_account_id,amt,0),(d.tenant_id,e,coalesce(d.account_id,s.inventory_adjust_account_id),0,amt);
    ELSIF d.doc_type='stock_out' AND cost>0 AND s.inventory_method<>'periodic' THEN
      INSERT INTO journal_lines(tenant_id,entry_id,account_id,project_id,debit,credit) VALUES
        (d.tenant_id,e,CASE WHEN d.project_id IS NOT NULL THEN s.project_cost_account_id ELSE s.inventory_adjust_account_id END,d.project_id,cost,0),
        (d.tenant_id,e,s.inventory_account_id,NULL,0,cost);
    END IF;
  END IF;
  IF d.doc_type='transfer' AND EXISTS(SELECT 1 FROM jsonb_each_text(svj) j WHERE round(j.value::numeric,4)<>0) THEN
    INSERT INTO journal_entries(tenant_id,entry_no,entry_date,description,currency,exchange_rate,doc_type,document_id,created_by,branch_id)
      VALUES (d.tenant_id,0,d.doc_date,coalesce(d.notes,'مناقلة مخزنية رقم '||d.doc_no),d.currency,d.exchange_rate,d.doc_type,_id,auth.uid(),d.branch_id) RETURNING id INTO e;
    FOR bk,bv IN SELECT j.key, round(j.value::numeric*coalesce(nullif(d.exchange_rate,0),1),4) FROM jsonb_each_text(svj) j LOOP
      IF bv<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit,branch_id) VALUES (d.tenant_id,e,bk::uuid,'مناقلة مخزنية رقم '||d.doc_no,greatest(bv,0),greatest(-bv,0),d.branch_id); END IF;
    END LOOP;
  END IF;
  IF e IS NOT NULL AND d.doc_type IN ('sale','sale_return','purchase','purchase_return') THEN
    SELECT count(*) INTO bad FROM document_lines WHERE document_id=_id AND product_id IS NULL AND account_id IS NULL;
    IF bad>0 THEN RAISE EXCEPTION 'حدد حساب الإيراد/المصروف لكل سطر خدمة'; END IF;
    INSERT INTO journal_lines(tenant_id,entry_id,account_id,description,debit,credit)
    SELECT d.tenant_id,e,x.a,coalesce(dl.description,'سطر خدمة'),x.db,x.cr
    FROM document_lines dl
    CROSS JOIN LATERAL (SELECT dl.qty*dl.unit_price - coalesce(dl.line_discount,0) + coalesce(dl.line_addition,0) AS v) w
    CROSS JOIN LATERAL (VALUES
      (CASE WHEN d.doc_type IN ('sale','sale_return') THEN s.sales_account_id ELSE s.inventory_account_id END,
       CASE WHEN d.doc_type IN ('sale','purchase_return') THEN w.v ELSE 0 END, CASE WHEN d.doc_type IN ('sale','purchase_return') THEN 0 ELSE w.v END),
      (dl.account_id,
        CASE WHEN d.doc_type IN ('sale','purchase_return') THEN 0 ELSE w.v END, CASE WHEN d.doc_type IN ('sale','purchase_return') THEN w.v ELSE 0 END)
    ) x(a,db,cr)
    WHERE dl.document_id=_id AND dl.product_id IS NULL AND w.v<>0;
  END IF;
  UPDATE documents SET status='posted', journal_entry_id=e, amount=CASE WHEN d.doc_type IN ('receipt','payment') THEN amount ELSE net END WHERE id=_id;
  RETURN e;
EXCEPTION WHEN not_null_violation THEN
  RAISE EXCEPTION 'أكمل الربط المحاسبي في الإعدادات (يوجد حساب غير محدد)';
END $$;


--
-- Name: products_apply_price_rules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.products_apply_price_rules() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE k text; md text; base numeric; v numeric; force boolean; rr jsonb;
BEGIN
  rr := coalesce(NEW.price_rules,'{}'::jsonb);
  IF NEW.is_group OR rr='{}'::jsonb THEN RETURN NEW; END IF;
  force := TG_OP='INSERT' OR NEW.price_rules IS DISTINCT FROM OLD.price_rules;
  IF NOT force AND NEW.avg_cost IS NOT DISTINCT FROM OLD.avg_cost AND NEW.purchase_price IS NOT DISTINCT FROM OLD.purchase_price
     AND NEW.last_purchase_price IS NOT DISTINCT FROM OLD.last_purchase_price THEN RETURN NEW; END IF;
  FOR k IN SELECT left(key, length(key)-5) FROM jsonb_object_keys(rr) key WHERE key LIKE '%\_mode' LOOP
    md := coalesce(rr->>(k||'_mode'),'fixed');
    CONTINUE WHEN md NOT IN ('cost','purchase');
    CONTINUE WHEN NOT force AND NOT coalesce((rr->>(k||'_auto'))::boolean,false);
    base := CASE WHEN md='cost' THEN NEW.avg_cost ELSE coalesce(nullif(NEW.purchase_price,0), NEW.last_purchase_price) END;
    CONTINUE WHEN coalesce(base,0)<=0;
    v := round(base*(1+coalesce(nullif(rr->>(k||'_pct'),'')::numeric,0)/100), 4);
    IF k='sale' THEN NEW.sale_price := v;
    ELSE NEW.prices := coalesce(NEW.prices,'{}'::jsonb) || jsonb_build_object(k, v); END IF;
  END LOOP;
  RETURN NEW;
END $$;


--
-- Name: products_category_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.products_category_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM products WHERE id = NEW.parent_id AND is_group) THEN
    RAISE EXCEPTION 'التصنيف المختار ليس تصنيفاً بل مادة';
  END IF;
  IF NEW.parent_id IS NOT NULL AND NOT NEW.is_group AND EXISTS (SELECT 1 FROM products WHERE parent_id = NEW.parent_id AND is_group) THEN
    RAISE EXCEPTION 'لا تُضاف المواد إلا في آخر تصنيف (تصنيف ليس له تصنيفات فرعية)';
  END IF;
  IF NEW.parent_id IS NOT NULL AND NEW.is_group AND EXISTS (SELECT 1 FROM products WHERE parent_id = NEW.parent_id AND NOT is_group AND id <> NEW.id) THEN
    RAISE EXCEPTION 'هذا التصنيف يحتوي مواد، لا يمكن إضافة تصنيف فرعي داخله';
  END IF;
  IF EXISTS (SELECT 1 FROM products WHERE tenant_id = NEW.tenant_id AND id <> NEW.id AND is_group <> NEW.is_group AND lower(trim(name)) = lower(trim(NEW.name))) THEN
    RAISE EXCEPTION 'الاسم «%» مستخدم لتصنيف/مادة أخرى — لا يجوز أن تحمل المادة اسم تصنيف', NEW.name;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: products_item_type_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.products_item_type_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE pt text;
BEGIN
  IF current_setting('app.restoring',true)='on' THEN RETURN NEW; END IF;
  IF NEW.parent_id IS NOT NULL AND NOT NEW.is_group THEN
    SELECT item_type INTO pt FROM public.products WHERE id=NEW.parent_id;
    IF pt IS NOT NULL AND pt <> NEW.item_type THEN
      RAISE EXCEPTION 'نوع المادة يجب أن يطابق نوع البطاقة التجميعية الأب (%)', CASE WHEN pt='service' THEN 'خدمية' ELSE 'مستودعية' END;
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.is_group AND NEW.item_type IS DISTINCT FROM OLD.item_type
     AND EXISTS(SELECT 1 FROM public.products WHERE parent_id=NEW.id AND NOT is_group AND item_type<>NEW.item_type) THEN
    RAISE EXCEPTION 'لا يمكن تغيير نوع البطاقة التجميعية لأن تحتها مواد من النوع الآخر';
  END IF;
  IF NEW.item_type='service' THEN NEW.default_warehouse_id := NULL;
  ELSE NEW.service_account_id := NULL; NEW.cost_center_id := NULL; NEW.account_link_mode := 'none'; NEW.cost_center_link_mode := 'none'; END IF;
  RETURN NEW;
END $$;


--
-- Name: products_service_links(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.products_service_links() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE p record; c record; nc text; n int;
BEGIN
  IF current_setting('app.restoring',true)='on' OR NEW.item_type<>'service' OR NEW.is_group THEN RETURN NEW; END IF;
  IF NEW.tenant_id <> public.my_tenant_id() AND NOT public.is_super_admin() THEN RETURN NEW; END IF;
  IF NEW.account_link_mode='none' THEN NEW.service_account_id := NULL; END IF;
  IF NEW.cost_center_link_mode='none' THEN NEW.cost_center_id := NULL; END IF;
  IF NEW.account_link_mode='new' AND NEW.service_account_parent_id IS NOT NULL AND NEW.service_account_id IS NULL THEN
    SELECT * INTO p FROM public.accounts WHERE id=NEW.service_account_parent_id AND tenant_id=NEW.tenant_id;
    IF p.id IS NULL THEN RAISE EXCEPTION 'الحساب الأب غير موجود'; END IF;
    IF NOT p.is_group THEN UPDATE public.accounts SET is_group=true WHERE id=p.id; END IF;
    SELECT count(*) INTO n FROM public.accounts WHERE parent_id=p.id;
    LOOP n := n+1; nc := p.code || lpad(n::text,2,'0');
      EXIT WHEN NOT EXISTS(SELECT 1 FROM public.accounts WHERE tenant_id=NEW.tenant_id AND code=nc); END LOOP;
    INSERT INTO public.accounts(tenant_id,code,name,parent_id,nature,currency,is_group)
      VALUES (NEW.tenant_id,nc,'مبيعات '||NEW.name,p.id,p.nature,p.currency,false) RETURNING id INTO NEW.service_account_id;
    NEW.account_link_mode := 'existing';
  END IF;
  IF NEW.cost_center_link_mode='new' AND NEW.cost_center_parent_id IS NOT NULL AND NEW.cost_center_id IS NULL THEN
    SELECT * INTO c FROM public.cost_centers WHERE id=NEW.cost_center_parent_id AND tenant_id=NEW.tenant_id;
    IF c.id IS NULL THEN RAISE EXCEPTION 'مركز الكلفة الأب غير موجود'; END IF;
    IF NOT c.is_group THEN UPDATE public.cost_centers SET is_group=true WHERE id=c.id; END IF;
    SELECT count(*) INTO n FROM public.cost_centers WHERE parent_id=c.id;
    LOOP n := n+1; nc := coalesce(c.code,'') || lpad(n::text,2,'0');
      EXIT WHEN NOT EXISTS(SELECT 1 FROM public.cost_centers WHERE tenant_id=NEW.tenant_id AND code=nc); END LOOP;
    INSERT INTO public.cost_centers(tenant_id,code,name,parent_id,is_group)
      VALUES (NEW.tenant_id,nc,NEW.name,c.id,false) RETURNING id INTO NEW.cost_center_id;
    NEW.cost_center_link_mode := 'existing';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: profile_self_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.profile_self_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.id = auth.uid() AND NOT OLD.is_super_admin
     AND coalesce(current_setting('app.self_ok', true),'') <> '1'
     AND (NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
          OR NEW.is_tenant_admin IS DISTINCT FROM OLD.is_tenant_admin OR NEW.is_auditor IS DISTINCT FROM OLD.is_auditor
          OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin OR NEW.account_kind IS DISTINCT FROM OLD.account_kind) THEN
    RAISE EXCEPTION 'لا يمكنك تعديل صلاحيات حسابك بنفسك';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: project_section_ok(text, public.perm_action); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.project_section_ok(_section text, _action public.perm_action) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_super_admin() OR public.is_tenant_admin()
    OR NOT EXISTS (SELECT 1 FROM public.user_permissions p WHERE p.user_id = auth.uid() AND p.module LIKE 'project\_%')
    OR public.has_perm('project_' || _section, _action)
$$;


--
-- Name: project_wbs_rollup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.project_wbs_rollup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  PERFORM public.recalc_wbs_progress(COALESCE(NEW.project_id, OLD.project_id));
  RETURN NULL;
END $$;


--
-- Name: provision_pos_drawer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.provision_pos_drawer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN
 IF TG_TABLE_NAME='profiles' THEN PERFORM public.ensure_pos_drawer(NEW.id); ELSE PERFORM public.ensure_pos_drawer(id) FROM profiles WHERE tenant_id=NEW.tenant_id AND account_kind IN ('sales_cashier','purchase_cashier'); END IF; RETURN NEW; END $$;


--
-- Name: purge_attachments_on_clear(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.purge_attachments_on_clear() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN DELETE FROM attachments WHERE tenant_id = OLD.id; RETURN OLD; END $$;


--
-- Name: purge_tenant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.purge_tenant(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET statement_timeout TO '120s'
    AS $_$
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
END $_$;


--
-- Name: recalc_wbs_progress(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.recalc_wbs_progress(_project uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r record; v_total numeric;
BEGIN
  FOR r IN
    WITH RECURSIVE t AS (
      SELECT id, 0 AS depth FROM project_wbs WHERE project_id = _project AND parent_id IS NULL
      UNION ALL SELECT w.id, t.depth + 1 FROM project_wbs w JOIN t ON w.parent_id = t.id
    )
    SELECT t.id FROM t JOIN project_wbs w ON w.id = t.id
    WHERE EXISTS (SELECT 1 FROM project_wbs c WHERE c.parent_id = t.id)
    ORDER BY t.depth DESC
  LOOP
    UPDATE project_wbs SET progress = COALESCE((
      SELECT SUM(c.progress * c.weight) / NULLIF(SUM(c.weight), 0) FROM project_wbs c WHERE c.parent_id = r.id), 0)
    WHERE id = r.id;
  END LOOP;
  SELECT COALESCE(SUM(progress * weight) / NULLIF(SUM(weight), 0), 0) INTO v_total
    FROM project_wbs WHERE project_id = _project AND parent_id IS NULL;
  UPDATE projects SET completion_pct = round(v_total, 2) WHERE id = _project;
  RETURN v_total;
END $$;


--
-- Name: receive_transfer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.receive_transfer(_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE d public.documents; nid uuid;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _id FOR UPDATE;
  IF d.id IS NULL OR d.tenant_id <> public.current_tenant_id() THEN RAISE EXCEPTION 'المستند غير موجود'; END IF;
  IF NOT public.has_perm('documents', 'create') THEN RAISE EXCEPTION 'لا تملك صلاحية إنشاء المستندات'; END IF;
  IF d.doc_type <> 'transfer' OR d.final_warehouse_id IS NULL THEN RAISE EXCEPTION 'هذه المناقلة ليست على مرحلتين'; END IF;
  IF d.status <> 'posted' THEN RAISE EXCEPTION 'يجب ترحيل مناقلة الإرسال أولاً'; END IF;
  IF d.received_document_id IS NOT NULL THEN RAISE EXCEPTION 'تم استلام هذه المناقلة سابقاً'; END IF;
  INSERT INTO public.documents (tenant_id, doc_type, doc_date, currency, exchange_rate, warehouse_id, to_warehouse_id, project_id, branch_id, amount, notes)
  VALUES (d.tenant_id, 'transfer', CURRENT_DATE, d.currency, d.exchange_rate, d.to_warehouse_id, d.final_warehouse_id, d.project_id, d.branch_id, d.amount,
          'استلام مناقلة ' || coalesce(d.doc_no, ''))
  RETURNING id INTO nid;
  INSERT INTO public.document_lines (tenant_id, document_id, product_id, qty, unit_price, expiry_date, description)
  SELECT tenant_id, nid, product_id, qty, unit_price, expiry_date, description FROM public.document_lines WHERE document_id = _id;
  PERFORM public.post_document(nid);
  UPDATE public.documents SET received_document_id = nid, received_at = now() WHERE id = _id;
  RETURN nid;
END $$;


--
-- Name: recipe_consume_on_sale(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.recipe_consume_on_sale() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE rec record;
BEGIN
  IF current_setting('app.restoring', true) = 'on' OR current_setting('app.bypass', true) = '1' THEN RETURN NEW; END IF;
  IF current_setting('app.recipe_consuming', true) = '1' THEN RETURN NEW; END IF;
  IF NEW.direction <> 'out' OR NEW.reference = 'recipe' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM product_recipes WHERE tenant_id = NEW.tenant_id AND product_id = NEW.product_id) THEN RETURN NEW; END IF;
  PERFORM set_config('app.recipe_consuming', '1', true);
  FOR rec IN SELECT component_product_id, qty * NEW.qty AS need FROM product_recipes
             WHERE tenant_id = NEW.tenant_id AND product_id = NEW.product_id LOOP
    INSERT INTO stock_moves(tenant_id, product_id, warehouse_id, move_date, direction, qty, unit_cost, project_id, partner_id, document_id, reference)
    VALUES (NEW.tenant_id, rec.component_product_id, NEW.warehouse_id, NEW.move_date, 'out', rec.need, 0, NEW.project_id, NEW.partner_id, NEW.document_id, 'recipe');
  END LOOP;
  PERFORM set_config('app.recipe_consuming', '', true);
  RETURN NEW;
END $$;


--
-- Name: record_comment_after(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.record_comment_after() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE u uuid; who text;
BEGIN
  SELECT full_name INTO who FROM public.profiles WHERE id = NEW.created_by;
  FOREACH u IN ARRAY NEW.mentions LOOP
    IF u <> NEW.created_by AND EXISTS (SELECT 1 FROM public.profiles WHERE id = u AND tenant_id = NEW.tenant_id) THEN
      PERFORM public.notify_user(u, NEW.tenant_id, coalesce(who,'زميل') || ' أشار إليك في ' || coalesce(NEW.entity_label, 'ملاحظة'), left(NEW.body, 200), 'mention', '/collab');
    END IF;
  END LOOP;
  RETURN NEW;
END $$;


--
-- Name: reopen_fiscal_period(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.reopen_fiscal_period() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT is_tenant_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  UPDATE tenant_settings SET closed_until=NULL, updated_at=now() WHERE tenant_id=my_tenant_id();
END $$;


--
-- Name: restore_company_begin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.restore_company_begin(_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
END $_$;


--
-- Name: restore_company_finish(uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.restore_company_finish(_id uuid, _settings jsonb, _tenant jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
END $_$;


--
-- Name: restore_company_rows(uuid, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.restore_company_rows(_id uuid, _table text, _rows jsonb, _phase text DEFAULT 'insert'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
END $_$;


--
-- Name: restore_tenant(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.restore_tenant(_id uuid, _data jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE tbl text; ts jsonb; fk record; col text;
BEGIN
  IF NOT (is_super_admin() OR (is_tenant_admin() AND my_tenant_id()=_id)) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  CREATE TEMP TABLE IF NOT EXISTS _acc_links(t text, c text, row_id uuid, acc uuid) ON COMMIT DROP;
  DELETE FROM _acc_links WHERE true;
  FOR fk IN SELECT c.conrelid::regclass::text AS t, a.attname AS c
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=any(c.conkey)
    WHERE c.contype='f' AND c.confrelid='public.accounts'::regclass AND c.conrelid<>'public.accounts'::regclass
      AND EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid=c.conrelid AND x.attname='tenant_id' AND NOT x.attisdropped)
  LOOP
    IF fk.t = 'tenant_settings' THEN
      EXECUTE format('UPDATE public.tenant_settings SET %I=NULL WHERE tenant_id=$1', fk.c) USING _id;
    ELSIF EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid=fk.t::regclass AND x.attname='id' AND NOT x.attisdropped) THEN
      EXECUTE format('INSERT INTO _acc_links SELECT %1$L,%2$L,id,%2$I FROM %1$I WHERE tenant_id=$1 AND %2$I IS NOT NULL', fk.t, fk.c) USING _id;
      EXECUTE format('UPDATE %1$I SET %2$I=NULL WHERE tenant_id=$1 AND %2$I IS NOT NULL', fk.t, fk.c) USING _id;
    END IF;
  END LOOP;
  PERFORM clear_tenant_data(_id);
  _data := public._restore_remap(_data);
  INSERT INTO accounts SELECT * FROM jsonb_populate_recordset(NULL::accounts,
    (SELECT coalesce(jsonb_agg(public._fill_defaults('accounts', x - 'parent_id' - 'closing_account_id') || jsonb_build_object('tenant_id',_id)),'[]'::jsonb) FROM jsonb_array_elements(coalesce(_data->'accounts','[]'::jsonb)) x));
  UPDATE accounts a SET parent_id=nullif(x->>'parent_id','')::uuid, closing_account_id=nullif(x->>'closing_account_id','')::uuid
    FROM jsonb_array_elements(coalesce(_data->'accounts','[]'::jsonb)) x WHERE a.id=(x->>'id')::uuid;
  FOREACH tbl IN ARRAY ARRAY['currencies','exchange_rates','partners','warehouses','banks','fixed_assets','projects','boq_items',
    'project_expenses','project_milestones','cheques','products','documents','journal_entries','journal_lines','document_lines'] LOOP
    IF _data ? tbl THEN
      EXECUTE format('INSERT INTO public.%1$I SELECT * FROM jsonb_populate_recordset(NULL::public.%1$I, $1) ON CONFLICT DO NOTHING', tbl)
        USING (SELECT coalesce(jsonb_agg(
                 (CASE WHEN tbl='documents' THEN public._fill_defaults(tbl, x - 'journal_entry_id' - 'settles_document_id')
                       ELSE public._fill_defaults(tbl, x) END)
                 || jsonb_build_object('tenant_id',_id)),'[]'::jsonb) FROM jsonb_array_elements(_data->tbl) x);
    END IF;
  END LOOP;
  IF _data ? 'stock_moves' THEN
    ALTER TABLE stock_moves DISABLE TRIGGER trg_stock_move;
    INSERT INTO stock_moves SELECT * FROM jsonb_populate_recordset(NULL::stock_moves,
      (SELECT coalesce(jsonb_agg(public._fill_defaults('stock_moves', x) || jsonb_build_object('tenant_id',_id)),'[]'::jsonb) FROM jsonb_array_elements(_data->'stock_moves') x));
    ALTER TABLE stock_moves ENABLE TRIGGER trg_stock_move;
  END IF;
  UPDATE documents dd SET journal_entry_id=nullif(x->>'journal_entry_id','')::uuid, settles_document_id=nullif(x->>'settles_document_id','')::uuid
    FROM jsonb_array_elements(coalesce(_data->'documents','[]'::jsonb)) x WHERE dd.id=(x->>'id')::uuid;
  FOR fk IN SELECT DISTINCT t, c FROM _acc_links LOOP
    EXECUTE format('UPDATE %1$I s SET %2$I=l.acc FROM _acc_links l WHERE l.t=%1$L AND l.c=%2$L AND l.row_id=s.id AND s.%2$I IS NULL AND EXISTS (SELECT 1 FROM accounts a WHERE a.id=l.acc)', fk.t, fk.c);
  END LOOP;
  ts := _data->'tenant_settings'->0;
  IF ts IS NOT NULL THEN
    FOR col IN SELECT a.attname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=any(c.conkey)
      WHERE c.contype='f' AND c.confrelid='public.accounts'::regclass AND c.conrelid='public.tenant_settings'::regclass LOOP
      EXECUTE format('UPDATE public.tenant_settings SET %1$I=(SELECT id FROM accounts WHERE id=nullif($2->>%2$L,'''')::uuid) WHERE tenant_id=$1', col, col) USING _id, ts;
    END LOOP;
    UPDATE tenant_settings t SET fiscal_start=r.fiscal_start, fiscal_end=r.fiscal_end, closed_until=r.closed_until
    FROM jsonb_populate_record(NULL::tenant_settings, ts) r WHERE t.tenant_id=_id;
  END IF;
END $_$;


--
-- Name: restore_tenant_full(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.restore_tenant_full(_id uuid, _data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
END $_$;


--
-- Name: revalue_fx_balances(date, jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.revalue_fx_balances(_date date, _rates jsonb, _post boolean DEFAULT false) RETURNS TABLE(account_id uuid, code text, name text, currency text, foreign_balance numeric, booked_base numeric, revalued_base numeric, diff numeric, entry_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t uuid := my_tenant_id(); s record; base text; e uuid; r record; g uuid; l uuid;
BEGIN
  IF t IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _post AND NOT (is_tenant_admin() OR has_perm('journal','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO s FROM tenant_settings WHERE tenant_id = t;
  base := coalesce(s.base_currency, 'USD');
  CREATE TEMP TABLE IF NOT EXISTS _fxr (account_id uuid, code text, name text, currency text, foreign_balance numeric, booked_base numeric, revalued_base numeric, diff numeric) ON COMMIT DROP;
  DELETE FROM _fxr WHERE true;
  INSERT INTO _fxr
  SELECT a.id, a.code, a.name, a.currency::text,
         round(sum(CASE
           WHEN je.doc_type = 'fx_revaluation' THEN 0
           WHEN jl.line_currency::text = a.currency::text AND coalesce(jl.fc_amount,0) <> 0
             THEN sign(jl.debit - jl.credit) * abs(jl.fc_amount)
           WHEN je.currency::text = a.currency::text THEN jl.debit - jl.credit
           ELSE (jl.debit - jl.credit) / coalesce(nullif(je.exchange_rate,0),1) * (_rates->>a.currency::text)::numeric END), 4),
         round(sum((jl.debit - jl.credit) / coalesce(nullif(je.exchange_rate,0),1)), 4), 0, 0
  FROM accounts a
  JOIN journal_lines jl ON jl.account_id = a.id
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE a.tenant_id = t AND NOT a.is_group AND a.is_monetary AND a.currency::text <> base
    AND je.entry_date <= _date AND coalesce((_rates->>a.currency::text)::numeric, 0) > 0
  GROUP BY a.id, a.code, a.name, a.currency;
  UPDATE _fxr f SET revalued_base = round(f.foreign_balance / (_rates->>f.currency)::numeric, 2) WHERE true;
  UPDATE _fxr f SET diff = round(f.revalued_base - f.booked_base, 2) WHERE true;
  DELETE FROM _fxr f WHERE f.diff = 0;
  IF _post AND EXISTS (SELECT 1 FROM _fxr) THEN
    INSERT INTO journal_entries(tenant_id, entry_no, entry_date, description, currency, exchange_rate, doc_type, created_by)
      VALUES (t, 0, _date, 'إعادة تقييم أرصدة العملات الأجنبية (الحسابات النقدية)', base::currency_code, 1, 'fx_revaluation', auth.uid()) RETURNING id INTO e;
    FOR r IN SELECT f.currency cur, sum(greatest(f.diff,0)) gain, sum(greatest(-f.diff,0)) loss FROM _fxr f GROUP BY f.currency LOOP
      SELECT c.gain_account_id, c.loss_account_id INTO g, l FROM currencies c WHERE c.tenant_id = t AND c.code = r.cur;
      g := coalesce(g, s.fx_gain_account_id, s.fx_account_id);
      l := coalesce(l, s.fx_loss_account_id, s.fx_account_id);
      IF (r.gain > 0 AND g IS NULL) OR (r.loss > 0 AND l IS NULL) THEN
        RAISE EXCEPTION 'حدد حساب أرباح وحساب خسائر فروق الصرف للعملة % أولاً', r.cur;
      END IF;
      IF r.gain > 0 THEN INSERT INTO journal_lines(tenant_id, entry_id, account_id, description, debit, credit) VALUES (t, e, g, 'أرباح فروق صرف ' || r.cur, 0, r.gain); END IF;
      IF r.loss > 0 THEN INSERT INTO journal_lines(tenant_id, entry_id, account_id, description, debit, credit) VALUES (t, e, l, 'خسائر فروق صرف ' || r.cur, r.loss, 0); END IF;
    END LOOP;
    FOR r IN SELECT * FROM _fxr LOOP
      INSERT INTO journal_lines(tenant_id, entry_id, account_id, description, debit, credit)
        VALUES (t, e, r.account_id, 'إعادة تقييم ' || r.currency, greatest(r.diff, 0), greatest(-r.diff, 0));
    END LOOP;
    INSERT INTO fx_log(tenant_id, kind, rate_date, source, details, entry_id, created_by)
    SELECT t, 'revaluation', _date, _rates::text, coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb), e, auth.uid() FROM _fxr f;
  END IF;
  RETURN QUERY SELECT f.account_id, f.code, f.name, f.currency, f.foreign_balance, f.booked_base, f.revalued_base, f.diff, e FROM _fxr f ORDER BY f.code;
END $$;


--
-- Name: revert_stock_move(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.revert_stock_move() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.products
    SET qty_on_hand = qty_on_hand + CASE WHEN OLD.direction = 'in' THEN -OLD.qty ELSE OLD.qty END
    WHERE id = OLD.product_id;
  RETURN OLD;
END;
$$;


--
-- Name: save_opening_entry(date, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.save_opening_entry(_date date, _lines jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t uuid := public.current_tenant_id(); e uuid;
BEGIN
  IF t IS NULL OR NOT (public.is_tenant_admin() OR public.has_perm('journal','edit') OR public.has_perm('journal','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(_lines) x WHERE NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=(x->>'account_id')::uuid AND a.tenant_id=t AND NOT a.is_group)) THEN RAISE EXCEPTION 'حساب غير صالح'; END IF;
  e := public.ensure_opening_entry(t, _date, public.my_branch_scope());
  IF EXISTS(SELECT 1 FROM journal_entries WHERE id=e AND audited) THEN RAISE EXCEPTION 'لا يمكن تعديل قيد مدقق'; END IF;
  UPDATE journal_entries SET entry_date=_date WHERE id=e;
  PERFORM set_config('app.posting','on',true);
  DELETE FROM journal_lines WHERE entry_id=e AND source_document_id IS NULL;
  INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit,description,line_currency,line_rate,fc_amount)
  SELECT t,e,(x->>'account_id')::uuid,coalesce((x->>'debit')::numeric,0),coalesce((x->>'credit')::numeric,0),nullif(x->>'description',''),nullif(x->>'line_currency',''),(x->>'line_rate')::numeric,(x->>'fc_amount')::numeric
  FROM jsonb_array_elements(_lines) x WHERE coalesce((x->>'debit')::numeric,0)>0 OR coalesce((x->>'credit')::numeric,0)>0;
  RETURN e;
END $$;


--
-- Name: service_order_quota(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.service_order_quota() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.contract_id IS NOT NULL AND NEW.status='done' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'done') THEN
    UPDATE service_contracts SET used = used + 1 WHERE id=NEW.contract_id AND tenant_id=NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: service_order_sla(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.service_order_sla() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _sla numeric; _w integer;
BEGIN
  SELECT sla_hours, warranty_days INTO _sla, _w FROM products WHERE id = NEW.product_id;
  IF TG_OP = 'INSERT' AND NEW.sla_due_at IS NULL AND COALESCE(_sla,0) > 0 THEN
    NEW.sla_due_at := COALESCE(NEW.created_at, now()) + make_interval(secs => (_sla * 3600)::double precision);
  END IF;
  IF NEW.status = 'done' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'done') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    IF NEW.warranty_until IS NULL AND COALESCE(_w,0) > 0 THEN
      NEW.warranty_until := (NEW.completed_at)::date + _w;
    END IF;
  ELSIF NEW.status <> 'done' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: service_orders_from_sale(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.service_orders_from_sale() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.doc_type='sale' AND NEW.status='posted' AND OLD.status IS DISTINCT FROM 'posted' THEN
    INSERT INTO service_orders(tenant_id,product_id,partner_id,document_id,project_id,est_hours,status)
    SELECT NEW.tenant_id, dl.product_id, NEW.partner_id, NEW.id, NEW.project_id, p.duration_hours*dl.qty, 'pending'
    FROM document_lines dl JOIN products p ON p.id=dl.product_id
    WHERE dl.document_id=NEW.id AND p.item_type='service' AND p.service_source='internal';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: set_active_branch(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_active_branch(_b uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE p record;
BEGIN
  SELECT * INTO p FROM profiles WHERE id = auth.uid();
  IF p.branch_id IS NOT NULL THEN RAISE EXCEPTION 'حسابك مرتبط بفرع محدد'; END IF;
  IF _b IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches WHERE id=_b AND tenant_id=p.tenant_id) THEN RAISE EXCEPTION 'فرع غير صالح'; END IF;
  UPDATE profiles SET active_branch_id = _b WHERE id = auth.uid();
END $$;


--
-- Name: set_bound_device_info(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_bound_device_info(_device text, _info jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _t uuid;
BEGIN
  SELECT tenant_id INTO _t FROM public.profiles WHERE id = auth.uid();
  IF _t IS NULL THEN RETURN false; END IF;
  UPDATE public.tenant_settings SET bound_device_info = _info
   WHERE tenant_id = _t AND bound_device_id = _device;
  RETURN FOUND;
END $$;


--
-- Name: set_entry_audited(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_entry_audited(_id uuid, _ok boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT is_auditor() THEN RAISE EXCEPTION 'التدقيق مسموح للمدقق فقط'; END IF;
  PERFORM set_config('app.bypass','1',true);
  UPDATE journal_entries SET audited=_ok, audited_at=CASE WHEN _ok THEN now() END, audited_by=CASE WHEN _ok THEN auth.uid() END
   WHERE id=_id AND tenant_id=my_tenant_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'القيد غير موجود'; END IF;
END $$;


--
-- Name: set_entry_no(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_entry_no() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.doc_type='opening' THEN
    IF NOT EXISTS(SELECT 1 FROM journal_entries WHERE tenant_id=NEW.tenant_id AND entry_no=1) THEN NEW.entry_no := 1; RETURN NEW; END IF;
  END IF;
  IF NEW.entry_no IS NULL OR NEW.entry_no = 0 THEN
    SELECT greatest(coalesce(max(entry_no),0),1)+1 INTO NEW.entry_no FROM journal_entries WHERE tenant_id=NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: set_mo_no(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_mo_no() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.mo_no IS NULL OR NEW.mo_no = 0 THEN
    SELECT coalesce(max(mo_no),0)+1 INTO NEW.mo_no FROM manufacturing_orders WHERE tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: set_mo_stage(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_mo_stage(_id uuid, _stage text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE o record; s record; rawacc uuid; matcost numeric; e uuid;
BEGIN
  IF NOT (is_tenant_admin() OR has_perm('stock','create')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _stage NOT IN ('planned','in_progress','qc') THEN RAISE EXCEPTION 'مرحلة غير صحيحة'; END IF;
  SELECT * INTO o FROM manufacturing_orders WHERE id = _id AND tenant_id = my_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'أمر التصنيع غير موجود'; END IF;
  IF o.status <> 'draft' THEN RAISE EXCEPTION 'الأمر منجز'; END IF;
  e := o.wip_entry_id;
  IF _stage IN ('in_progress','qc') AND o.wip_entry_id IS NULL AND o.wip_account_id IS NOT NULL THEN
    SELECT * INTO s FROM tenant_settings WHERE tenant_id = o.tenant_id;
    SELECT id INTO rawacc FROM accounts WHERE tenant_id = o.tenant_id AND code = '1331' AND NOT is_group LIMIT 1;
    rawacc := coalesce(rawacc, s.inventory_account_id);
    matcost := mo_material_cost(_id);
    IF matcost > 0 AND rawacc IS NOT NULL AND rawacc <> o.wip_account_id THEN
      INSERT INTO journal_entries(tenant_id, entry_no, entry_date, description, currency, exchange_rate, doc_type, created_by)
      VALUES (o.tenant_id, 0, current_date, 'تحويل مواد إلى إنتاج تحت التشغيل - أمر ' || o.mo_no, o.currency, 1, 'manufacture', auth.uid())
      RETURNING id INTO e;
      INSERT INTO journal_lines(tenant_id, entry_id, account_id, debit, credit) VALUES
        (o.tenant_id, e, o.wip_account_id, matcost, 0), (o.tenant_id, e, rawacc, 0, matcost);
    END IF;
  END IF;
  UPDATE manufacturing_orders SET stage = _stage, wip_entry_id = e WHERE id = _id;
  RETURN e;
END $$;


--
-- Name: set_operating_mode(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_operating_mode(_mode text, _device text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _t uuid := public.current_tenant_id();
BEGIN
  IF NOT (public.is_tenant_admin() OR public.is_super_admin()) THEN RAISE EXCEPTION 'مدير النظام فقط يحدد نمط التشغيل'; END IF;
  IF _mode NOT IN ('single_device','multi_device') THEN RAISE EXCEPTION 'نمط غير صالح'; END IF;
  INSERT INTO tenant_settings(tenant_id, operating_mode, bound_device_id, bound_device_at)
  VALUES (_t, _mode, CASE WHEN _mode='single_device' THEN nullif(_device,'') END, now())
  ON CONFLICT (tenant_id) DO UPDATE SET operating_mode = EXCLUDED.operating_mode, bound_device_id = EXCLUDED.bound_device_id, bound_device_at = now();
END $$;


--
-- Name: set_tenant_branding(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_tenant_branding(_logo text, _color text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE t uuid := public.current_tenant_id();
BEGIN
  IF t IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;
  IF NOT (public.is_tenant_admin() OR public.has_perm('accounts','edit') OR public.has_perm('project_users','create')) THEN
    RAISE EXCEPTION 'لا تملك صلاحية تغيير هوية البرنامج';
  END IF;
  IF _color IS NOT NULL AND _color !~ '^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'لون غير صالح'; END IF;
  INSERT INTO public.tenant_settings(tenant_id, logo_url, primary_color) VALUES (t, _logo, _color)
  ON CONFLICT (tenant_id) DO UPDATE SET logo_url = EXCLUDED.logo_url, primary_color = EXCLUDED.primary_color;
END $_$;


--
-- Name: set_tenant_theme(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_tenant_theme(_logo text, _colors jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE t uuid := public.current_tenant_id(); c text;
BEGIN
  IF t IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;
  IF NOT (public.is_tenant_admin() OR public.has_perm('project_users','create')) THEN
    RAISE EXCEPTION 'لا تملك صلاحية تغيير هوية البرنامج'; END IF;
  _colors := coalesce(_colors, '[]'::jsonb);
  IF jsonb_typeof(_colors) <> 'array' OR jsonb_array_length(_colors) > 6 THEN RAISE EXCEPTION 'ألوان غير صالحة'; END IF;
  FOR c IN SELECT jsonb_array_elements_text(_colors) LOOP
    IF c !~ '^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'لون غير صالح'; END IF;
  END LOOP;
  INSERT INTO public.tenant_settings(tenant_id, logo_url, primary_color, theme_colors)
  VALUES (t, _logo, _colors->>0, _colors)
  ON CONFLICT (tenant_id) DO UPDATE SET logo_url = EXCLUDED.logo_url, primary_color = EXCLUDED.primary_color, theme_colors = EXCLUDED.theme_colors;
END $_$;


--
-- Name: set_tenant_white_label(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_tenant_white_label(_on boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t uuid := public.current_tenant_id();
BEGIN
  IF t IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;
  IF NOT (public.is_tenant_admin() OR public.has_perm('project_users','create')) THEN
    RAISE EXCEPTION 'لا تملك صلاحية تغيير هوية البرنامج'; END IF;
  INSERT INTO public.tenant_settings(tenant_id, white_label) VALUES (t, coalesce(_on,true))
  ON CONFLICT (tenant_id) DO UPDATE SET white_label = EXCLUDED.white_label;
END $$;


--
-- Name: solar_section_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.solar_section_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.survey IS DISTINCT FROM OLD.survey AND NOT public.project_section_ok('survey','edit') THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل قسم الكشف'; END IF;
  IF NEW.finance IS DISTINCT FROM OLD.finance AND NOT public.project_section_ok('finance','edit') THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل القسم المالي'; END IF;
  IF NEW.permits IS DISTINCT FROM OLD.permits AND NOT public.project_section_ok('permits','edit') THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل قسم التراخيص'; END IF;
  RETURN NEW;
END $$;


--
-- Name: stock_moves_no_group_wh(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.stock_moves_no_group_wh() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM warehouses WHERE id=NEW.warehouse_id AND is_group) THEN
    RAISE EXCEPTION 'لا يمكن استخدام مستودع رئيسي في الحركات، اختر مستودعاً فرعياً';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: support_message_after(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.support_message_after() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t public.support_tickets;
BEGIN
  UPDATE public.support_tickets SET updated_at = now(), status = CASE WHEN NEW.is_staff THEN status ELSE 'open' END WHERE id = NEW.ticket_id RETURNING * INTO t;
  IF NEW.is_staff THEN
    PERFORM public.notify_user(t.created_by, t.tenant_id, 'رد جديد من الدعم الفني', left(NEW.body, 200), 'support', '/support');
  ELSE
    PERFORM public.notify_super_admins(t.tenant_id, 'رسالة دعم: ' || t.subject, left(NEW.body, 200), 'support', '/support');
  END IF;
  RETURN NEW;
END $$;


--
-- Name: switch_tenant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.switch_tenant(_t uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE m record;
BEGIN
  SELECT * INTO m FROM tenant_members WHERE user_id = auth.uid() AND tenant_id = _t;
  IF m IS NULL THEN RAISE EXCEPTION 'ليس لديك حساب في هذا الملف'; END IF;
  PERFORM set_config('app.self_ok','1',true);
  UPDATE profiles SET tenant_id = _t, is_tenant_admin = m.is_tenant_admin, is_auditor = m.is_auditor,
    account_kind = m.account_kind, branch_id = NULL, active_branch_id = NULL WHERE id = auth.uid();
  PERFORM set_config('app.self_ok','',true);
END $$;


--
-- Name: sync_entity_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.sync_entity_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE pa uuid;
BEGIN
  IF current_setting('app.restoring',true)='on' OR NEW.account_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.accounts SET name=NEW.name WHERE id=NEW.account_id AND tenant_id=NEW.tenant_id;
  END IF;
  IF NEW.parent_id IS DISTINCT FROM OLD.parent_id AND NEW.parent_id IS NOT NULL THEN
    EXECUTE format('SELECT account_id FROM public.%I WHERE id=$1', TG_TABLE_NAME) INTO pa USING NEW.parent_id;
    IF pa IS NOT NULL AND pa <> NEW.account_id THEN
      UPDATE public.accounts SET parent_id=pa WHERE id=NEW.account_id AND tenant_id=NEW.tenant_id AND parent_id IS DISTINCT FROM pa;
    END IF;
  END IF;
  RETURN NEW;
END $_$;


--
-- Name: sync_tenant_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.sync_tenant_member() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    INSERT INTO tenant_members(user_id, tenant_id, is_tenant_admin, is_auditor, account_kind)
    VALUES (NEW.id, NEW.tenant_id, NEW.is_tenant_admin, NEW.is_auditor, coalesce(NEW.account_kind,'standard'))
    ON CONFLICT (user_id, tenant_id) DO UPDATE SET is_tenant_admin = EXCLUDED.is_tenant_admin,
      is_auditor = EXCLUDED.is_auditor, account_kind = EXCLUDED.account_kind;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: telegram_auto_add_station(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.telegram_auto_add_station() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.project_id IS NOT NULL AND NEW.tenant_id IS NOT NULL THEN
    INSERT INTO public.telegram_team_projects(team_id, tenant_id, project_id)
    SELECT t.id, NEW.tenant_id, NEW.project_id FROM public.telegram_teams t
    WHERE t.tenant_id = NEW.tenant_id
      AND NOT EXISTS (SELECT 1 FROM public.telegram_team_projects x WHERE x.team_id = t.id AND x.project_id = NEW.project_id);
  END IF;
  RETURN NEW;
END $$;


--
-- Name: tenant_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.tenant_active() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_super_admin() OR public.current_tenant_id() IS NOT NULL
$$;


--
-- Name: tenant_colleagues(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.tenant_colleagues() RETURNS TABLE(id uuid, full_name text, email text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.full_name, p.email FROM public.profiles p
  WHERE p.tenant_id = public.current_tenant_id() AND p.is_active
  ORDER BY p.full_name
$$;


--
-- Name: undo_audit(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.undo_audit(_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE r public.audit_log; cols text;
BEGIN
  SELECT * INTO r FROM public.audit_log WHERE id = _id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'العملية غير موجودة'; END IF;
  IF NOT (is_super_admin() OR (r.tenant_id = current_tenant_id() AND is_tenant_admin())) THEN
    RAISE EXCEPTION 'التراجع متاح لمدير الشركة فقط';
  END IF;
  IF r.table_name IN ('audit_log','tenants','profiles','user_permissions','tenant_members') THEN
    RAISE EXCEPTION 'لا يمكن التراجع عن عمليات هذا الجدول';
  END IF;
  IF r.action = 'INSERT' THEN
    EXECUTE format('DELETE FROM public.%I WHERE id::text = $1', r.table_name) USING r.record_id;
  ELSIF r.action = 'DELETE' THEN
    EXECUTE format('INSERT INTO public.%1$I SELECT * FROM jsonb_populate_record(NULL::public.%1$I, $1)', r.table_name) USING r.old_data;
  ELSIF r.action = 'UPDATE' THEN
    SELECT string_agg(format('%1$I = x.%1$I', column_name), ', ') INTO cols
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = r.table_name AND column_name <> 'id'
        AND is_generated = 'NEVER' AND r.old_data ? column_name;
    EXECUTE format('UPDATE public.%1$I t SET %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1) x WHERE t.id::text = $2', r.table_name, cols)
      USING r.old_data, r.record_id;
  END IF;
END $_$;


--
-- Name: unpost_document(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.unpost_document(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE d record; s record; v numeric; cap uuid; ln record;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _id FOR UPDATE;
  IF d IS NULL THEN RAISE EXCEPTION 'المستند غير موجود'; END IF;
  IF NOT public.is_super_admin() AND (d.tenant_id <> public.current_tenant_id() OR NOT public.has_perm('documents','edit')) THEN
    RAISE EXCEPTION 'لا تملك صلاحية إلغاء الترحيل';
  END IF;
  IF d.status <> 'posted' THEN RAISE EXCEPTION 'المستند غير مرحّل'; END IF;
  PERFORM set_config('app.posting', 'on', true);
  DELETE FROM public.stock_moves WHERE document_id = _id;
  IF EXISTS(SELECT 1 FROM public.journal_lines WHERE source_document_id=_id) THEN
    SELECT coalesce(sum(debit),0) INTO v FROM public.journal_lines WHERE source_document_id=_id;
    SELECT capital_account_id INTO cap FROM public.tenant_settings WHERE tenant_id=d.tenant_id;
    SELECT * INTO ln FROM public.journal_lines WHERE entry_id=d.journal_entry_id AND source_document_id IS NULL AND debit=0 AND credit>0 ORDER BY (account_id IS NOT DISTINCT FROM cap) DESC, credit DESC LIMIT 1;
    DELETE FROM public.journal_lines WHERE source_document_id=_id;
    IF ln.id IS NOT NULL THEN
      IF ln.credit - v > 0.0001 THEN UPDATE public.journal_lines SET credit=credit-v WHERE id=ln.id;
      ELSIF v - ln.credit > 0.0001 THEN UPDATE public.journal_lines SET credit=0, debit=v-ln.credit WHERE id=ln.id;
      ELSE DELETE FROM public.journal_lines WHERE id=ln.id; END IF;
    END IF;
  ELSE
    DELETE FROM public.journal_lines WHERE entry_id IN (SELECT id FROM public.journal_entries WHERE document_id = _id);
    DELETE FROM public.journal_entries WHERE document_id = _id;
  END IF;
  UPDATE public.documents SET status = 'draft', journal_entry_id = NULL WHERE id = _id;
END $$;


--
-- Name: update_company_info(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_company_info(_name text, _code text, _phone text, _address text, _notes text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT is_tenant_admin() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  UPDATE tenants SET name=coalesce(nullif(trim(_name),''),name), code=nullif(_code,''), phone=nullif(_phone,''), address=nullif(_address,''), notes=nullif(_notes,'')
   WHERE id=my_tenant_id();
END $$;


--
-- Name: update_my_profile(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_my_profile(_full_name text, _phone text, _avatar_url text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.profiles SET full_name = coalesce(nullif(trim(_full_name), ''), full_name),
    phone = nullif(trim(_phone), ''), avatar_url = _avatar_url
  WHERE id = auth.uid();
$$;


--
-- Name: validate_closing_account_links(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.validate_closing_account_links() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE pair record;
BEGIN
 FOR pair IN SELECT * FROM jsonb_each_text(NEW.closing_account_links) LOOP
  IF pair.key NOT IN ('balance_sheet','profit_loss','trading','operating') THEN RAISE EXCEPTION 'مرحلة إقفال غير صالحة'; END IF;
  IF nullif(pair.value,'') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=pair.value::uuid AND tenant_id=NEW.tenant_id AND nature='closing' AND NOT is_group) THEN RAISE EXCEPTION 'اختر حساباً ختامياً فرعياً موجوداً من الشركة نفسها'; END IF;
 END LOOP;
 RETURN NEW;
END $$;


--
-- Name: validate_initial_quantity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.validate_initial_quantity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$ BEGIN IF NEW.initial_quantity < 0 THEN RAISE EXCEPTION 'الكمية الأولية لا يمكن أن تكون سالبة'; END IF; IF NEW.is_group AND NEW.initial_quantity <> 0 THEN RAISE EXCEPTION 'الكمية الأولية للمواد الفرعية فقط'; END IF; RETURN NEW; END $$;


--
-- Name: warehouses_tree_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.warehouses_tree_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN RAISE EXCEPTION 'لا يمكن أن يكون المستودع أباً لنفسه'; END IF;
    IF NOT EXISTS (SELECT 1 FROM warehouses WHERE id=NEW.parent_id AND is_group) THEN
      IF EXISTS (SELECT 1 FROM stock_moves WHERE warehouse_id=NEW.parent_id) THEN
        RAISE EXCEPTION 'المستودع الأب يحتوي حركات مخزون، لا يمكن إضافة مستودع فرعي له';
      END IF;
      UPDATE warehouses SET is_group=true WHERE id=NEW.parent_id;
    END IF;
  END IF;
  IF NEW.is_group AND TG_OP='UPDATE' AND NOT OLD.is_group
     AND EXISTS (SELECT 1 FROM stock_moves WHERE warehouse_id=NEW.id) THEN
    RAISE EXCEPTION 'لا يمكن تحويل مستودع له حركات إلى مستودع رئيسي';
  END IF;
  IF NOT NEW.is_group AND TG_OP='UPDATE' AND OLD.is_group
     AND EXISTS (SELECT 1 FROM warehouses WHERE parent_id=NEW.id) THEN
    RAISE EXCEPTION 'المستودع الرئيسي يحتوي مستودعات فرعية';
  END IF;
  RETURN NEW;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _probe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._probe (
    id integer NOT NULL
);


--
-- Name: _restore_req; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._restore_req (
    id bigint
);


--
-- Name: _stg_auth_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._stg_auth_identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text,
    id uuid NOT NULL
);


--
-- Name: _stg_auth_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._stg_auth_users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text,
    phone_confirmed_at timestamp with time zone,
    phone_change text,
    phone_change_token character varying(255),
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    email_change_token_current character varying(255),
    email_change_confirm_status smallint,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255),
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean NOT NULL
);


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    parent_id uuid,
    nature public.account_nature DEFAULT 'balance_sheet'::public.account_nature NOT NULL,
    currency public.currency_code DEFAULT 'USD'::public.currency_code NOT NULL,
    is_group boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    closing_account_id uuid,
    closing_type text,
    cash_flow_type text,
    is_monetary boolean DEFAULT false NOT NULL,
    name_en text,
    entity_generated boolean DEFAULT false NOT NULL,
    balance_side text,
    CONSTRAINT accounts_balance_side_chk CHECK (((balance_side IS NULL) OR (balance_side = ANY (ARRAY['debit'::text, 'credit'::text, 'both'::text]))))
);


--
-- Name: ai_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id() NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    thread_id uuid,
    result_id uuid,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_drafts_kind_check CHECK ((kind = ANY (ARRAY['journal'::text, 'document'::text, 'partner'::text, 'product'::text]))),
    CONSTRAINT ai_drafts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: ai_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    msg_id text NOT NULL,
    role text NOT NULL,
    parts jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id(),
    title text DEFAULT 'محادثة جديدة'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_config (
    key text NOT NULL,
    value text
);


--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    title text NOT NULL,
    amount numeric,
    note text,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by uuid DEFAULT auth.uid() NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    decision_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assembly_vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assembly_vouchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    voucher_no integer DEFAULT 0 NOT NULL,
    mode text NOT NULL,
    voucher_date date DEFAULT CURRENT_DATE NOT NULL,
    warehouse_id uuid NOT NULL,
    product_id uuid NOT NULL,
    qty numeric NOT NULL,
    total_cost numeric DEFAULT 0 NOT NULL,
    components jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    to_warehouse_id uuid,
    journal_entry_id uuid,
    CONSTRAINT assembly_vouchers_mode_check CHECK ((mode = ANY (ARRAY['assemble'::text, 'disassemble'::text])))
);


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    attach_type text DEFAULT 'other'::text NOT NULL,
    file_path text NOT NULL,
    file_name text NOT NULL,
    mime_type text,
    size_bytes bigint,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attachments_entity_type_check CHECK ((entity_type = ANY (ARRAY['document'::text, 'journal_entry'::text, 'employee'::text, 'project'::text])))
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    tenant_id uuid,
    user_id uuid,
    table_name text NOT NULL,
    record_id text,
    action text NOT NULL,
    old_data jsonb,
    new_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    file_path text NOT NULL,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bank_recon_marks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_recon_marks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.my_tenant_id() NOT NULL,
    account_id uuid NOT NULL,
    journal_line_id uuid NOT NULL,
    statement_date date DEFAULT CURRENT_DATE NOT NULL,
    statement_ref text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: banks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    branch text,
    account_no text,
    currency public.currency_code DEFAULT 'USD'::public.currency_code NOT NULL,
    account_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid
);


--
-- Name: batch_consumptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batch_consumptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    move_id uuid NOT NULL,
    qty numeric DEFAULT 0 NOT NULL
);


--
-- Name: boq_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boq_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    item_name text NOT NULL,
    unit text,
    qty numeric(18,4) DEFAULT 0 NOT NULL,
    unit_price numeric(18,4) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    address text,
    phone text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    recipient_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cheques; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cheques (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    cheque_no text NOT NULL,
    direction text DEFAULT 'incoming'::text NOT NULL,
    bank_id uuid,
    partner_id uuid,
    amount numeric(18,4) NOT NULL,
    currency public.currency_code DEFAULT 'USD'::public.currency_code NOT NULL,
    issue_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date DEFAULT CURRENT_DATE NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    posted_status text,
    CONSTRAINT cheques_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT cheques_direction_check CHECK ((direction = ANY (ARRAY['incoming'::text, 'outgoing'::text]))),
    CONSTRAINT cheques_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'collected'::text, 'returned'::text, 'cancelled'::text])))
);


--
-- Name: cost_centers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cost_centers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text,
    name text NOT NULL,
    account_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_id uuid,
    is_group boolean DEFAULT false NOT NULL,
    name_en text
);


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    symbol text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    gain_account_id uuid,
    loss_account_id uuid,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: doc_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doc_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id() NOT NULL,
    name text NOT NULL,
    doc_type text NOT NULL,
    defaults jsonb DEFAULT '{}'::jsonb NOT NULL,
    locked text[] DEFAULT '{}'::text[] NOT NULL,
    hidden text[] DEFAULT '{}'::text[] NOT NULL,
    partner_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    allowed_user_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    explanation text,
    accounts jsonb DEFAULT '{}'::jsonb NOT NULL,
    partner_group_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    partner_account_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    warehouse_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    entry_lines jsonb DEFAULT '[]'::jsonb NOT NULL,
    cash_account_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    currency_codes text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: document_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    document_id uuid NOT NULL,
    product_id uuid,
    qty numeric NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expiry_date date,
    line_discount numeric DEFAULT 0 NOT NULL,
    line_addition numeric DEFAULT 0 NOT NULL,
    account_id uuid,
    description text,
    warehouse_id uuid,
    charge_accounts jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT document_lines_qty_check CHECK ((qty > (0)::numeric)),
    CONSTRAINT document_lines_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    doc_type text NOT NULL,
    doc_no integer,
    doc_date date DEFAULT CURRENT_DATE NOT NULL,
    currency public.currency_code DEFAULT 'USD'::public.currency_code NOT NULL,
    exchange_rate numeric DEFAULT 1 NOT NULL,
    partner_id uuid,
    warehouse_id uuid,
    to_warehouse_id uuid,
    project_id uuid,
    account_id uuid,
    amount numeric DEFAULT 0 NOT NULL,
    notes text,
    status text DEFAULT 'draft'::text NOT NULL,
    journal_entry_id uuid,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    settles_document_id uuid,
    valid_until date,
    terms text,
    doc_time time without time zone,
    payment_mode text DEFAULT 'credit'::text NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    freight_amount numeric DEFAULT 0 NOT NULL,
    branch_id uuid,
    charges jsonb DEFAULT '[]'::jsonb NOT NULL,
    pay_currency text,
    pay_amount numeric(18,4),
    partner_account_id uuid,
    cash_account_id uuid,
    final_warehouse_id uuid,
    received_document_id uuid,
    received_at timestamp with time zone,
    pattern_id uuid,
    CONSTRAINT documents_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT documents_doc_type_check CHECK ((doc_type = ANY (ARRAY['sale'::text, 'purchase'::text, 'receipt'::text, 'payment'::text, 'transfer'::text, 'stock_in'::text, 'stock_out'::text, 'quote'::text, 'sale_return'::text, 'purchase_return'::text, 'purchase_request'::text, 'purchase_order'::text, 'payment_order'::text, 'opening_inventory'::text, 'closing_inventory'::text, 'stocktake'::text]))),
    CONSTRAINT documents_exchange_rate_check CHECK ((exchange_rate > (0)::numeric)),
    CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'posted'::text])))
);


--
-- Name: employee_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    kind text DEFAULT 'deduction'::text NOT NULL,
    adj_date date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    applied boolean DEFAULT false NOT NULL,
    payroll_month text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_advances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_advances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    adv_date date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    deducted boolean DEFAULT false NOT NULL,
    payroll_month text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_leaves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_leaves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    leave_type text DEFAULT 'annual'::text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text,
    name text NOT NULL,
    job_title text,
    phone text,
    hire_date date,
    base_salary numeric DEFAULT 0 NOT NULL,
    allowances numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    department text,
    email text,
    national_id text,
    address text,
    bank_account text,
    account_id uuid,
    user_id uuid,
    branch_id uuid
);


--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    rate_date date DEFAULT CURRENT_DATE NOT NULL,
    currency public.currency_code DEFAULT 'SYP'::public.currency_code NOT NULL,
    rate_to_usd numeric(18,6) NOT NULL,
    source text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exchange_rates_rate_to_usd_check CHECK ((rate_to_usd > (0)::numeric))
);


--
-- Name: fixed_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fixed_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text,
    name text NOT NULL,
    purchase_date date DEFAULT CURRENT_DATE NOT NULL,
    cost numeric(18,4) NOT NULL,
    salvage_value numeric(18,4) DEFAULT 0 NOT NULL,
    useful_life_years integer DEFAULT 5 NOT NULL,
    currency public.currency_code DEFAULT 'USD'::public.currency_code NOT NULL,
    account_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    dep_expense_account_id uuid,
    accum_dep_account_id uuid,
    last_dep_date date,
    CONSTRAINT fixed_assets_cost_check CHECK ((cost >= (0)::numeric)),
    CONSTRAINT fixed_assets_salvage_value_check CHECK ((salvage_value >= (0)::numeric)),
    CONSTRAINT fixed_assets_useful_life_years_check CHECK ((useful_life_years > 0))
);


--
-- Name: fx_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fx_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    kind text NOT NULL,
    rate_date date NOT NULL,
    currency text,
    old_rate numeric,
    new_rate numeric,
    source text,
    details jsonb DEFAULT '[]'::jsonb NOT NULL,
    entry_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hotel_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotel_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    room_id uuid NOT NULL,
    guest_name text NOT NULL,
    guest_phone text,
    check_in date NOT NULL,
    check_out date NOT NULL,
    nights integer DEFAULT 1 NOT NULL,
    rate numeric DEFAULT 0 NOT NULL,
    advance_amount numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    status text DEFAULT 'reserved'::text NOT NULL,
    journal_entry_id uuid,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    CONSTRAINT hotel_reservations_check CHECK ((check_out > check_in))
);


--
-- Name: hotel_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotel_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    room_no text NOT NULL,
    room_type text,
    floor integer,
    price_per_night numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    entry_no integer NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    description text,
    currency public.currency_code DEFAULT 'USD'::public.currency_code NOT NULL,
    exchange_rate numeric(18,6) DEFAULT 1 NOT NULL,
    doc_type text DEFAULT 'journal'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    document_id uuid,
    audited boolean DEFAULT false NOT NULL,
    audited_at timestamp with time zone,
    audited_by uuid,
    branch_id uuid,
    CONSTRAINT journal_entries_exchange_rate_check CHECK ((exchange_rate > (0)::numeric))
);


--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    entry_id uuid NOT NULL,
    account_id uuid NOT NULL,
    partner_id uuid,
    project_id uuid,
    description text,
    debit numeric(18,4) DEFAULT 0 NOT NULL,
    credit numeric(18,4) DEFAULT 0 NOT NULL,
    cost_center_id uuid,
    branch_id uuid,
    line_currency text,
    line_rate numeric,
    fc_amount numeric,
    source_document_id uuid,
    CONSTRAINT journal_lines_check CHECK ((NOT ((debit > (0)::numeric) AND (credit > (0)::numeric)))),
    CONSTRAINT journal_lines_credit_check CHECK ((credit >= (0)::numeric)),
    CONSTRAINT journal_lines_debit_check CHECK ((debit >= (0)::numeric))
);


--
-- Name: login_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid,
    event text NOT NULL,
    ip text,
    user_agent text,
    device text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    device_id text,
    device_info jsonb,
    CONSTRAINT login_events_event_check CHECK ((event = ANY (ARRAY['sign_in'::text, 'sign_out'::text])))
);


--
-- Name: manufacturing_byproducts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_byproducts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.my_tenant_id() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    qty numeric DEFAULT 0 NOT NULL,
    unit_value numeric DEFAULT 0 NOT NULL
);


--
-- Name: manufacturing_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    component_product_id uuid NOT NULL,
    qty numeric DEFAULT 1 NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    CONSTRAINT manufacturing_materials_qty_check CHECK ((qty > (0)::numeric))
);


--
-- Name: manufacturing_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    mo_no integer,
    product_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    qty numeric DEFAULT 1 NOT NULL,
    mo_date date DEFAULT CURRENT_DATE NOT NULL,
    labor_cost numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    journal_entry_id uuid,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    overhead_cost numeric DEFAULT 0 NOT NULL,
    overhead_account_id uuid,
    scrap_pct numeric DEFAULT 0 NOT NULL,
    good_qty numeric,
    standard_unit_cost numeric DEFAULT 0 NOT NULL,
    actual_total_cost numeric,
    stage text DEFAULT 'planned'::text NOT NULL,
    wip_account_id uuid,
    wip_entry_id uuid,
    CONSTRAINT manufacturing_orders_qty_check CHECK ((qty > (0)::numeric))
);


--
-- Name: notification_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_reads (
    user_id uuid NOT NULL,
    notification_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    title text NOT NULL,
    body text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'announcement'::text NOT NULL,
    link text,
    user_id uuid
);


--
-- Name: owner_finance_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owner_finance_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    title text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    currency public.currency_code DEFAULT 'USD'::public.currency_code NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT owner_finance_entries_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT owner_finance_entries_kind_check CHECK ((kind = ANY (ARRAY['salary'::text, 'expense'::text])))
);


--
-- Name: partner_inquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_inquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    link_id uuid NOT NULL,
    from_partner boolean DEFAULT false NOT NULL,
    author_name text,
    body text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text,
    name text NOT NULL,
    partner_type text DEFAULT 'customer'::text NOT NULL,
    phone text,
    address text,
    account_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    parent_id uuid,
    is_group boolean DEFAULT false NOT NULL,
    barcode text,
    auto_account boolean DEFAULT false NOT NULL,
    price_level integer,
    currency text,
    credit_limit numeric DEFAULT 0 NOT NULL,
    auto_parent_account_id uuid,
    name_en text,
    is_monetary boolean DEFAULT false NOT NULL,
    deal_type text DEFAULT 'both'::text NOT NULL,
    CONSTRAINT partners_deal_type_chk CHECK ((deal_type = ANY (ARRAY['stock'::text, 'service'::text, 'both'::text]))),
    CONSTRAINT partners_partner_type_check CHECK ((partner_type = ANY (ARRAY['customer'::text, 'supplier'::text, 'both'::text])))
);


--
-- Name: payroll_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    month text NOT NULL,
    total_gross numeric DEFAULT 0 NOT NULL,
    total_advances numeric DEFAULT 0 NOT NULL,
    total_net numeric DEFAULT 0 NOT NULL,
    journal_entry_id uuid,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid
);


--
-- Name: personal_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personal_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    remind_at timestamp with time zone,
    repeat text DEFAULT 'none'::text NOT NULL,
    done boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_to uuid,
    tenant_id uuid DEFAULT public.my_tenant_id(),
    kind text DEFAULT 'note'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    color text DEFAULT 'default'::text NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    due_at timestamp with time zone,
    status text DEFAULT 'open'::text NOT NULL,
    reply text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid
);


--
-- Name: pos_stations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_stations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.my_tenant_id() NOT NULL,
    branch_id uuid,
    station_type text DEFAULT 'sale'::text NOT NULL,
    name text NOT NULL,
    pattern_id uuid,
    warehouse_id uuid,
    lock_warehouse boolean DEFAULT true NOT NULL,
    cash_account_id uuid,
    default_partner_id uuid,
    price_level text,
    allowed_user_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    allow_expenses boolean DEFAULT false NOT NULL,
    expense_account_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    max_expense numeric DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    partner_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    partner_group_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    lock_partner boolean DEFAULT false NOT NULL,
    cash_account_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    lock_price_level boolean DEFAULT true NOT NULL
);


--
-- Name: product_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    product_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    batch_no text,
    expiry_date date,
    qty_remaining numeric DEFAULT 0 NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    document_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_recipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_recipes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    product_id uuid NOT NULL,
    component_product_id uuid NOT NULL,
    qty numeric DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_recipes_qty_check CHECK ((qty > (0)::numeric))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    sku text NOT NULL,
    barcode text,
    name text NOT NULL,
    unit text DEFAULT 'قطعة'::text NOT NULL,
    category text,
    reorder_level numeric(18,4) DEFAULT 0 NOT NULL,
    default_warehouse_id uuid,
    last_purchase_price numeric(18,4) DEFAULT 0 NOT NULL,
    avg_cost numeric(18,4) DEFAULT 0 NOT NULL,
    qty_on_hand numeric(18,4) DEFAULT 0 NOT NULL,
    currency public.currency_code DEFAULT 'USD'::public.currency_code NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    parent_id uuid,
    is_group boolean DEFAULT false NOT NULL,
    sale_price numeric DEFAULT 0 NOT NULL,
    prices jsonb DEFAULT '{}'::jsonb NOT NULL,
    purchase_price numeric(18,4) DEFAULT 0 NOT NULL,
    price_rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    name_en text,
    initial_quantity numeric DEFAULT 0 NOT NULL,
    item_type text DEFAULT 'stock'::text NOT NULL,
    service_account_id uuid,
    cost_center_id uuid,
    account_link_mode text DEFAULT 'none'::text NOT NULL,
    cost_center_link_mode text DEFAULT 'none'::text NOT NULL,
    service_account_parent_id uuid,
    cost_center_parent_id uuid,
    service_source text DEFAULT 'internal'::text NOT NULL,
    service_expense_account_id uuid,
    standard_cost numeric DEFAULT 0 NOT NULL,
    min_price numeric DEFAULT 0 NOT NULL,
    duration_hours numeric DEFAULT 0 NOT NULL,
    billing_period text DEFAULT 'once'::text NOT NULL,
    warranty_days integer DEFAULT 0 NOT NULL,
    sla_hours numeric DEFAULT 0 NOT NULL,
    CONSTRAINT products_item_type_chk CHECK ((item_type = ANY (ARRAY['stock'::text, 'service'::text]))),
    CONSTRAINT products_service_source_chk CHECK ((service_source = ANY (ARRAY['internal'::text, 'purchased'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    tenant_id uuid,
    full_name text DEFAULT ''::text NOT NULL,
    email text,
    is_super_admin boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_tenant_admin boolean DEFAULT false NOT NULL,
    is_auditor boolean DEFAULT false NOT NULL,
    notif_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    account_kind text DEFAULT 'standard'::text NOT NULL,
    phone text,
    avatar_url text,
    branch_id uuid,
    active_branch_id uuid,
    must_change_password boolean DEFAULT false NOT NULL,
    CONSTRAINT profiles_account_kind_check CHECK ((account_kind = ANY (ARRAY['standard'::text, 'sales_cashier'::text, 'purchase_cashier'::text, 'warehouse_keeper'::text, 'projects_only'::text])))
);


--
-- Name: project_bom; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_bom (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    category text DEFAULT 'panels'::text NOT NULL,
    item text NOT NULL,
    spec text,
    qty numeric DEFAULT 0 NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    supply_status text DEFAULT 'requested'::text NOT NULL,
    waste_qty numeric DEFAULT 0 NOT NULL,
    product_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    description text NOT NULL,
    amount numeric(18,4) NOT NULL,
    currency public.currency_code DEFAULT 'USD'::public.currency_code NOT NULL,
    account_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_expenses_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: project_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    due_date date,
    amount numeric(18,4) DEFAULT 0 NOT NULL,
    is_done boolean DEFAULT false NOT NULL,
    invoiced boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    trigger_pct numeric
);


--
-- Name: project_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    title text DEFAULT 'العرض المالي'::text NOT NULL,
    quote_date date DEFAULT CURRENT_DATE NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_snags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_snags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL,
    location text,
    priority text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    closed_at timestamp with time zone,
    closed_by uuid,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_snags_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text]))),
    CONSTRAINT project_snags_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'closed'::text])))
);


--
-- Name: project_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id() NOT NULL,
    name text NOT NULL,
    description text,
    tree jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_wbs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_wbs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    parent_id uuid,
    section text DEFAULT 'civil'::text NOT NULL,
    name text NOT NULL,
    weight numeric DEFAULT 1 NOT NULL,
    progress numeric DEFAULT 0 NOT NULL,
    is_final boolean DEFAULT true NOT NULL,
    is_continuous boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    start_date date,
    end_date date,
    assignee text,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text,
    name text NOT NULL,
    client_id uuid,
    contract_value numeric(18,4) DEFAULT 0 NOT NULL,
    currency public.currency_code DEFAULT 'USD'::public.currency_code NOT NULL,
    start_date date,
    end_date date,
    completion_pct numeric(5,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    parent_id uuid,
    is_group boolean DEFAULT false NOT NULL,
    account_id uuid,
    branch_id uuid,
    name_en text,
    lead_contact text,
    lead_phone text,
    lead_source text,
    brand_color text,
    brand_logo_path text,
    CONSTRAINT projects_completion_pct_check CHECK (((completion_pct >= (0)::numeric) AND (completion_pct <= (100)::numeric))),
    CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['lead'::text, 'active'::text, 'on_hold'::text, 'completed'::text, 'closed'::text])))
);


--
-- Name: record_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.record_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    entity_label text,
    kind text DEFAULT 'comment'::text NOT NULL,
    body text NOT NULL,
    mentions uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recurring_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    currency text DEFAULT 'USD'::text NOT NULL,
    debit_account_id uuid NOT NULL,
    credit_account_id uuid NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    frequency text DEFAULT 'monthly'::text NOT NULL,
    next_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approval_mode text DEFAULT 'approval'::text NOT NULL
);


--
-- Name: restored_user_passwords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restored_user_passwords (
    user_id uuid NOT NULL,
    tenant_id uuid,
    temp_password text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id() NOT NULL,
    partner_id uuid,
    product_id uuid,
    title text DEFAULT ''::text NOT NULL,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    period text DEFAULT 'monthly'::text NOT NULL,
    price numeric DEFAULT 0 NOT NULL,
    quota numeric DEFAULT 0 NOT NULL,
    used numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    next_billing_date date,
    last_document_id uuid
);


--
-- Name: service_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id() NOT NULL,
    product_id uuid,
    partner_id uuid,
    document_id uuid,
    contract_id uuid,
    project_id uuid,
    employee_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    due_date date,
    est_hours numeric DEFAULT 0 NOT NULL,
    actual_hours numeric DEFAULT 0 NOT NULL,
    commission_pct numeric DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sla_due_at timestamp with time zone,
    completed_at timestamp with time zone,
    warranty_until date
);


--
-- Name: share_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.current_tenant_id() NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    label text,
    revoked boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '60 days'::interval) NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash text,
    password_salt text
);


--
-- Name: shared_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT public.my_tenant_id() NOT NULL,
    kind text NOT NULL,
    draft_key text NOT NULL,
    title text,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: solar_ai_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solar_ai_access (
    tenant_id uuid NOT NULL,
    blocked boolean DEFAULT false NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    status integer DEFAULT 403 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: solar_fault_analyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solar_fault_analyses (
    tenant_id uuid NOT NULL,
    cache_key text NOT NULL,
    analysis text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: solar_fleet_stations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solar_fleet_stations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    plant_id text NOT NULL,
    name text NOT NULL,
    capacity_kwp numeric DEFAULT 0 NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    plant_kind text,
    CONSTRAINT solar_fleet_stations_plant_kind_check CHECK (((plant_kind IS NULL) OR (plant_kind = ANY (ARRAY['ess'::text, 'ongrid'::text])))),
    CONSTRAINT solar_fleet_stations_provider_check CHECK ((provider = ANY (ARRAY['sungrow'::text, 'sma'::text])))
);


--
-- Name: solar_monitoring; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solar_monitoring (
    project_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    provider text DEFAULT 'sungrow'::text NOT NULL,
    plant_id text,
    inverter_sn text,
    capacity_kwp numeric DEFAULT 0 NOT NULL,
    tariff numeric DEFAULT 0 NOT NULL,
    demo boolean DEFAULT true NOT NULL,
    last_data jsonb,
    last_sync timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    system_cost numeric DEFAULT 0 NOT NULL,
    peak_sun_hours numeric DEFAULT 5 NOT NULL,
    cleaning_days integer DEFAULT 30 NOT NULL,
    last_cleaned date,
    tickets jsonb DEFAULT '[]'::jsonb NOT NULL,
    fleet_station_id uuid,
    extra_units jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: solar_performance_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solar_performance_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    day date NOT NULL,
    ratio numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: solar_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solar_projects (
    project_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    approval_status text DEFAULT 'pending'::text NOT NULL,
    survey jsonb DEFAULT '{}'::jsonb NOT NULL,
    finance jsonb DEFAULT '{}'::jsonb NOT NULL,
    permits jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: solar_provider_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solar_provider_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT solar_provider_accounts_provider_check CHECK ((provider = ANY (ARRAY['sungrow'::text, 'sma'::text])))
);


--
-- Name: solar_readings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solar_readings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    read_at timestamp with time zone NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: solar_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solar_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'sales'::text NOT NULL
);


--
-- Name: stock_moves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_moves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    product_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    move_date date DEFAULT CURRENT_DATE NOT NULL,
    direction text NOT NULL,
    qty numeric(18,4) NOT NULL,
    unit_cost numeric(18,4) DEFAULT 0 NOT NULL,
    project_id uuid,
    partner_id uuid,
    reference text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    document_id uuid,
    branch_id uuid,
    CONSTRAINT stock_moves_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT stock_moves_qty_check CHECK ((qty > (0)::numeric)),
    CONSTRAINT stock_moves_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: subscription_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    plan text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    sender_id uuid DEFAULT auth.uid() NOT NULL,
    is_staff boolean DEFAULT false NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    subject text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_branding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_branding (
    id boolean DEFAULT true NOT NULL,
    system_name text,
    system_name_en text,
    logo_url text,
    mark_url text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_branding_id_check CHECK (id)
);


--
-- Name: telegram_client_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_client_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    token text NOT NULL,
    chat_id bigint,
    telegram_user_id bigint,
    display_name text,
    active boolean DEFAULT true NOT NULL,
    alerts_enabled boolean DEFAULT true NOT NULL,
    last_alert_key text,
    linked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash text,
    password_salt text,
    pending_chat_id bigint,
    failed_attempts integer DEFAULT 0 NOT NULL
);


--
-- Name: telegram_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id uuid NOT NULL,
    delivery_key text NOT NULL,
    state text DEFAULT 'sending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT telegram_deliveries_state_check CHECK ((state = ANY (ARRAY['sending'::text, 'sent'::text, 'failed'::text])))
);


--
-- Name: telegram_join_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_join_sessions (
    telegram_user_id bigint NOT NULL,
    chat_id bigint NOT NULL,
    team_id uuid NOT NULL,
    step text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
    CONSTRAINT telegram_join_sessions_step_check CHECK ((step = ANY (ARRAY['password'::text, 'name'::text])))
);


--
-- Name: telegram_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_links (
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    chat_id bigint,
    link_code text,
    code_expires timestamp with time zone,
    linked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: telegram_member_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_member_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    member_id uuid NOT NULL,
    event text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: telegram_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    chat_id bigint NOT NULL,
    telegram_user_id bigint NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    reports_enabled boolean DEFAULT true NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    blocked boolean DEFAULT false NOT NULL,
    last_seen_at timestamp with time zone,
    logged_out_at timestamp with time zone,
    system_user_id uuid,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: telegram_team_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_team_projects (
    team_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL
);


--
-- Name: telegram_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    password_hash text NOT NULL,
    password_salt text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    daily_enabled boolean DEFAULT false NOT NULL,
    report_hour integer DEFAULT 18 NOT NULL,
    alerts_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    report_templates jsonb DEFAULT '["status"]'::jsonb NOT NULL,
    CONSTRAINT telegram_teams_report_hour_check CHECK (((report_hour >= 0) AND (report_hour <= 23)))
);


--
-- Name: telegram_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_updates (
    update_id bigint NOT NULL,
    state text DEFAULT 'processing'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_features (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    module text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


--
-- Name: tenant_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    provider text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_integrations_provider_check CHECK ((provider = ANY (ARRAY['sungrow'::text, 'telegram'::text])))
);


--
-- Name: TABLE tenant_integrations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tenant_integrations IS 'Server-only provider credentials; no client grants.';


--
-- Name: tenant_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_members (
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    is_tenant_admin boolean DEFAULT false NOT NULL,
    is_auditor boolean DEFAULT false NOT NULL,
    account_kind text DEFAULT 'standard'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    pay_date date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_settings (
    tenant_id uuid NOT NULL,
    cash_account_id uuid,
    customers_account_id uuid,
    suppliers_account_id uuid,
    inventory_account_id uuid,
    sales_account_id uuid,
    cogs_account_id uuid,
    project_cost_account_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fx_account_id uuid,
    retained_earnings_account_id uuid,
    salaries_account_id uuid,
    advances_account_id uuid,
    inventory_adjust_account_id uuid,
    cost_method text DEFAULT 'avg'::text NOT NULL,
    fiscal_start date,
    fiscal_end date,
    period_type text DEFAULT 'yearly'::text NOT NULL,
    closed_until date,
    logo_url text,
    primary_color text,
    onboarding_done boolean DEFAULT false NOT NULL,
    auto_backup boolean DEFAULT true NOT NULL,
    last_backup_at timestamp with time zone,
    backup_every_days integer DEFAULT 7 NOT NULL,
    business_sector text,
    business_activity text,
    manual_datetime boolean DEFAULT true NOT NULL,
    standard_coding boolean DEFAULT false NOT NULL,
    base_currency text DEFAULT 'USD'::text NOT NULL,
    sales_discount_account_id uuid,
    purchase_discount_account_id uuid,
    sales_freight_account_id uuid,
    purchase_freight_account_id uuid,
    has_branches boolean DEFAULT false NOT NULL,
    account_code_len integer DEFAULT 12 NOT NULL,
    product_code_len integer DEFAULT 12 NOT NULL,
    warehouse_code_len integer DEFAULT 12 NOT NULL,
    price_names jsonb DEFAULT '["جملة", "مفرق"]'::jsonb NOT NULL,
    fx_gain_account_id uuid,
    fx_loss_account_id uuid,
    stock_shortage_account_id uuid,
    stock_surplus_account_id uuid,
    notes_receivable_account_id uuid,
    notes_payable_account_id uuid,
    dep_expense_account_id uuid,
    accum_dep_account_id uuid,
    doc_type_accounts jsonb DEFAULT '{}'::jsonb NOT NULL,
    inventory_method text DEFAULT 'perpetual'::text NOT NULL,
    purchases_account_id uuid,
    entity_account_roots jsonb DEFAULT '{}'::jsonb NOT NULL,
    closing_account_links jsonb DEFAULT '{}'::jsonb NOT NULL,
    tax_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    tax_number text,
    print_template text DEFAULT 'modern'::text NOT NULL,
    print_footer text,
    operating_mode text DEFAULT 'multi_device'::text NOT NULL,
    bound_device_id text,
    bound_device_at timestamp with time zone,
    bound_device_info jsonb,
    fx_reval_mode text DEFAULT 'on_demand'::text NOT NULL,
    fx_reval_last date,
    service_price_names jsonb DEFAULT '[]'::jsonb NOT NULL,
    capital_account_id uuid,
    letterhead jsonb DEFAULT '{}'::jsonb NOT NULL,
    purchase_cost_policy text DEFAULT 'net'::text NOT NULL,
    pattern_notes jsonb DEFAULT '{}'::jsonb NOT NULL,
    primary_pattern_denied jsonb DEFAULT '{}'::jsonb NOT NULL,
    receipt_template jsonb DEFAULT '{}'::jsonb NOT NULL,
    theme_colors jsonb DEFAULT '[]'::jsonb NOT NULL,
    white_label boolean DEFAULT true NOT NULL,
    CONSTRAINT tenant_settings_cost_method_check CHECK ((cost_method = ANY (ARRAY['avg'::text, 'fifo'::text, 'last'::text]))),
    CONSTRAINT tenant_settings_fx_mode_chk CHECK ((fx_reval_mode = ANY (ARRAY['auto'::text, 'scheduled'::text, 'on_demand'::text, 'at_close'::text, 'on_rate_change'::text]))),
    CONSTRAINT tenant_settings_operating_mode_chk CHECK ((operating_mode = ANY (ARRAY['single_device'::text, 'multi_device'::text]))),
    CONSTRAINT tenant_settings_purchase_cost_policy_chk CHECK ((purchase_cost_policy = ANY (ARRAY['price'::text, 'less_disc'::text, 'plus_add'::text, 'net'::text])))
);


--
-- Name: COLUMN tenant_settings.doc_type_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tenant_settings.doc_type_accounts IS 'Primary pattern main accounts per document type (edited from pattern management).';


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text,
    phone text,
    address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    plan text DEFAULT 'trial'::text NOT NULL,
    sub_start date DEFAULT CURRENT_DATE NOT NULL,
    sub_end date DEFAULT (CURRENT_DATE + 30) NOT NULL,
    max_users integer DEFAULT 5 NOT NULL,
    notes text,
    subscription_fee numeric DEFAULT 0 NOT NULL,
    name_en text,
    source_tenant_id uuid,
    fiscal_label text,
    CONSTRAINT tenants_plan_chk CHECK ((plan = ANY (ARRAY['trial'::text, 'monthly'::text, 'yearly'::text, 'custom'::text])))
);


--
-- Name: TABLE tenants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tenants IS 'Restored from backup schema';


--
-- Name: units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    base_unit text,
    factor numeric DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'stock'::text NOT NULL,
    CONSTRAINT units_kind_check CHECK ((kind = ANY (ARRAY['stock'::text, 'service'::text])))
);


--
-- Name: user_cash_drawers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_cash_drawers (
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    account_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    module text NOT NULL,
    can_view boolean DEFAULT true NOT NULL,
    can_create boolean DEFAULT false NOT NULL,
    can_edit boolean DEFAULT false NOT NULL,
    can_delete boolean DEFAULT false NOT NULL
);


--
-- Name: user_prefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_prefs (
    user_id uuid NOT NULL,
    notif jsonb,
    dashboard jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    extra jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text,
    name text NOT NULL,
    location text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    parent_id uuid,
    is_group boolean DEFAULT false NOT NULL,
    allow_negative boolean DEFAULT false NOT NULL,
    branch_id uuid,
    name_en text,
    account_id uuid
);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: _probe _probe_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._probe
    ADD CONSTRAINT _probe_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: ai_drafts ai_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_drafts
    ADD CONSTRAINT ai_drafts_pkey PRIMARY KEY (id);


--
-- Name: ai_messages ai_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_pkey PRIMARY KEY (id);


--
-- Name: ai_messages ai_messages_thread_id_msg_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_thread_id_msg_id_key UNIQUE (thread_id, msg_id);


--
-- Name: ai_threads ai_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_threads
    ADD CONSTRAINT ai_threads_pkey PRIMARY KEY (id);


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (key);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: assembly_vouchers assembly_vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assembly_vouchers
    ADD CONSTRAINT assembly_vouchers_pkey PRIMARY KEY (id);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: backups backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backups
    ADD CONSTRAINT backups_pkey PRIMARY KEY (id);


--
-- Name: bank_recon_marks bank_recon_marks_journal_line_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_recon_marks
    ADD CONSTRAINT bank_recon_marks_journal_line_id_key UNIQUE (journal_line_id);


--
-- Name: bank_recon_marks bank_recon_marks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_recon_marks
    ADD CONSTRAINT bank_recon_marks_pkey PRIMARY KEY (id);


--
-- Name: banks banks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banks
    ADD CONSTRAINT banks_pkey PRIMARY KEY (id);


--
-- Name: batch_consumptions batch_consumptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_consumptions
    ADD CONSTRAINT batch_consumptions_pkey PRIMARY KEY (id);


--
-- Name: boq_items boq_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boq_items
    ADD CONSTRAINT boq_items_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: branches branches_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: cheques cheques_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheques
    ADD CONSTRAINT cheques_pkey PRIMARY KEY (id);


--
-- Name: cost_centers cost_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_pkey PRIMARY KEY (id);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);


--
-- Name: currencies currencies_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: doc_patterns doc_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doc_patterns
    ADD CONSTRAINT doc_patterns_pkey PRIMARY KEY (id);


--
-- Name: document_lines document_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_lines
    ADD CONSTRAINT document_lines_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: documents documents_tenant_id_doc_type_doc_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_tenant_id_doc_type_doc_no_key UNIQUE (tenant_id, doc_type, doc_no);


--
-- Name: employee_adjustments employee_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_adjustments
    ADD CONSTRAINT employee_adjustments_pkey PRIMARY KEY (id);


--
-- Name: employee_advances employee_advances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_pkey PRIMARY KEY (id);


--
-- Name: employee_leaves employee_leaves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leaves
    ADD CONSTRAINT employee_leaves_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_tenant_id_rate_date_currency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_tenant_id_rate_date_currency_key UNIQUE (tenant_id, rate_date, currency);


--
-- Name: fixed_assets fixed_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_pkey PRIMARY KEY (id);


--
-- Name: fixed_assets fixed_assets_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: fx_log fx_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_log
    ADD CONSTRAINT fx_log_pkey PRIMARY KEY (id);


--
-- Name: hotel_reservations hotel_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_reservations
    ADD CONSTRAINT hotel_reservations_pkey PRIMARY KEY (id);


--
-- Name: hotel_rooms hotel_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_rooms
    ADD CONSTRAINT hotel_rooms_pkey PRIMARY KEY (id);


--
-- Name: hotel_rooms hotel_rooms_tenant_id_room_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_rooms
    ADD CONSTRAINT hotel_rooms_tenant_id_room_no_key UNIQUE (tenant_id, room_no);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_tenant_id_entry_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_tenant_id_entry_no_key UNIQUE (tenant_id, entry_no);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: login_events login_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_events
    ADD CONSTRAINT login_events_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_byproducts manufacturing_byproducts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_byproducts
    ADD CONSTRAINT manufacturing_byproducts_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_materials manufacturing_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_materials
    ADD CONSTRAINT manufacturing_materials_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_orders manufacturing_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_orders
    ADD CONSTRAINT manufacturing_orders_pkey PRIMARY KEY (id);


--
-- Name: notification_reads notification_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_pkey PRIMARY KEY (user_id, notification_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: owner_finance_entries owner_finance_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_finance_entries
    ADD CONSTRAINT owner_finance_entries_pkey PRIMARY KEY (id);


--
-- Name: partner_inquiries partner_inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_inquiries
    ADD CONSTRAINT partner_inquiries_pkey PRIMARY KEY (id);


--
-- Name: partners partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);


--
-- Name: partners partners_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: payroll_runs payroll_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_pkey PRIMARY KEY (id);


--
-- Name: payroll_runs payroll_runs_tenant_id_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_tenant_id_month_key UNIQUE (tenant_id, month);


--
-- Name: personal_notes personal_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personal_notes
    ADD CONSTRAINT personal_notes_pkey PRIMARY KEY (id);


--
-- Name: pos_shifts pos_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_shifts
    ADD CONSTRAINT pos_shifts_pkey PRIMARY KEY (id);


--
-- Name: pos_stations pos_stations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_stations
    ADD CONSTRAINT pos_stations_pkey PRIMARY KEY (id);


--
-- Name: product_batches product_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_batches
    ADD CONSTRAINT product_batches_pkey PRIMARY KEY (id);


--
-- Name: product_recipes product_recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recipes
    ADD CONSTRAINT product_recipes_pkey PRIMARY KEY (id);


--
-- Name: product_recipes product_recipes_product_id_component_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recipes
    ADD CONSTRAINT product_recipes_product_id_component_product_id_key UNIQUE (product_id, component_product_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: project_bom project_bom_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bom
    ADD CONSTRAINT project_bom_pkey PRIMARY KEY (id);


--
-- Name: project_expenses project_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_expenses
    ADD CONSTRAINT project_expenses_pkey PRIMARY KEY (id);


--
-- Name: project_milestones project_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_pkey PRIMARY KEY (id);


--
-- Name: project_quotes project_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_quotes
    ADD CONSTRAINT project_quotes_pkey PRIMARY KEY (id);


--
-- Name: project_snags project_snags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_snags
    ADD CONSTRAINT project_snags_pkey PRIMARY KEY (id);


--
-- Name: project_templates project_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_templates
    ADD CONSTRAINT project_templates_pkey PRIMARY KEY (id);


--
-- Name: project_wbs project_wbs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_wbs
    ADD CONSTRAINT project_wbs_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: projects projects_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: record_comments record_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_comments
    ADD CONSTRAINT record_comments_pkey PRIMARY KEY (id);


--
-- Name: recurring_entries recurring_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_entries
    ADD CONSTRAINT recurring_entries_pkey PRIMARY KEY (id);


--
-- Name: restored_user_passwords restored_user_passwords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restored_user_passwords
    ADD CONSTRAINT restored_user_passwords_pkey PRIMARY KEY (user_id);


--
-- Name: service_contracts service_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_contracts
    ADD CONSTRAINT service_contracts_pkey PRIMARY KEY (id);


--
-- Name: service_orders service_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT service_orders_pkey PRIMARY KEY (id);


--
-- Name: share_links share_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_pkey PRIMARY KEY (id);


--
-- Name: share_links share_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_token_key UNIQUE (token);


--
-- Name: shared_drafts shared_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_drafts
    ADD CONSTRAINT shared_drafts_pkey PRIMARY KEY (id);


--
-- Name: shared_drafts shared_drafts_tenant_id_kind_draft_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_drafts
    ADD CONSTRAINT shared_drafts_tenant_id_kind_draft_key_key UNIQUE (tenant_id, kind, draft_key);


--
-- Name: solar_ai_access solar_ai_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_ai_access
    ADD CONSTRAINT solar_ai_access_pkey PRIMARY KEY (tenant_id);


--
-- Name: solar_fault_analyses solar_fault_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_fault_analyses
    ADD CONSTRAINT solar_fault_analyses_pkey PRIMARY KEY (tenant_id, cache_key);


--
-- Name: solar_fleet_stations solar_fleet_stations_account_id_plant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_fleet_stations
    ADD CONSTRAINT solar_fleet_stations_account_id_plant_id_key UNIQUE (account_id, plant_id);


--
-- Name: solar_fleet_stations solar_fleet_stations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_fleet_stations
    ADD CONSTRAINT solar_fleet_stations_pkey PRIMARY KEY (id);


--
-- Name: solar_monitoring solar_monitoring_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_monitoring
    ADD CONSTRAINT solar_monitoring_pkey PRIMARY KEY (project_id);


--
-- Name: solar_performance_flags solar_performance_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_performance_flags
    ADD CONSTRAINT solar_performance_flags_pkey PRIMARY KEY (id);


--
-- Name: solar_performance_flags solar_performance_flags_project_id_day_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_performance_flags
    ADD CONSTRAINT solar_performance_flags_project_id_day_key UNIQUE (project_id, day);


--
-- Name: solar_projects solar_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_projects
    ADD CONSTRAINT solar_projects_pkey PRIMARY KEY (project_id);


--
-- Name: solar_provider_accounts solar_provider_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_provider_accounts
    ADD CONSTRAINT solar_provider_accounts_pkey PRIMARY KEY (id);


--
-- Name: solar_readings solar_readings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_readings
    ADD CONSTRAINT solar_readings_pkey PRIMARY KEY (id);


--
-- Name: solar_readings solar_readings_project_id_read_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_readings
    ADD CONSTRAINT solar_readings_project_id_read_at_key UNIQUE (project_id, read_at);


--
-- Name: solar_roles solar_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_roles
    ADD CONSTRAINT solar_roles_pkey PRIMARY KEY (id);


--
-- Name: solar_roles solar_roles_tenant_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_roles
    ADD CONSTRAINT solar_roles_tenant_id_user_id_key UNIQUE (tenant_id, user_id);


--
-- Name: stock_moves stock_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_moves
    ADD CONSTRAINT stock_moves_pkey PRIMARY KEY (id);


--
-- Name: subscription_history subscription_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_history
    ADD CONSTRAINT subscription_history_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: system_branding system_branding_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_branding
    ADD CONSTRAINT system_branding_pkey PRIMARY KEY (id);


--
-- Name: telegram_client_links telegram_client_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_client_links
    ADD CONSTRAINT telegram_client_links_pkey PRIMARY KEY (id);


--
-- Name: telegram_client_links telegram_client_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_client_links
    ADD CONSTRAINT telegram_client_links_token_key UNIQUE (token);


--
-- Name: telegram_deliveries telegram_deliveries_member_id_delivery_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_deliveries
    ADD CONSTRAINT telegram_deliveries_member_id_delivery_key_key UNIQUE (member_id, delivery_key);


--
-- Name: telegram_deliveries telegram_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_deliveries
    ADD CONSTRAINT telegram_deliveries_pkey PRIMARY KEY (id);


--
-- Name: telegram_join_sessions telegram_join_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_join_sessions
    ADD CONSTRAINT telegram_join_sessions_pkey PRIMARY KEY (telegram_user_id);


--
-- Name: telegram_links telegram_links_chat_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_links
    ADD CONSTRAINT telegram_links_chat_id_key UNIQUE (chat_id);


--
-- Name: telegram_links telegram_links_link_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_links
    ADD CONSTRAINT telegram_links_link_code_key UNIQUE (link_code);


--
-- Name: telegram_links telegram_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_links
    ADD CONSTRAINT telegram_links_pkey PRIMARY KEY (user_id);


--
-- Name: telegram_member_events telegram_member_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_member_events
    ADD CONSTRAINT telegram_member_events_pkey PRIMARY KEY (id);


--
-- Name: telegram_team_members telegram_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_team_members
    ADD CONSTRAINT telegram_team_members_pkey PRIMARY KEY (id);


--
-- Name: telegram_team_members telegram_team_members_team_id_telegram_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_team_members
    ADD CONSTRAINT telegram_team_members_team_id_telegram_user_id_key UNIQUE (team_id, telegram_user_id);


--
-- Name: telegram_team_projects telegram_team_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_team_projects
    ADD CONSTRAINT telegram_team_projects_pkey PRIMARY KEY (team_id, project_id);


--
-- Name: telegram_teams telegram_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_teams
    ADD CONSTRAINT telegram_teams_pkey PRIMARY KEY (id);


--
-- Name: telegram_teams telegram_teams_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_teams
    ADD CONSTRAINT telegram_teams_tenant_id_key UNIQUE (tenant_id);


--
-- Name: telegram_updates telegram_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_updates
    ADD CONSTRAINT telegram_updates_pkey PRIMARY KEY (update_id);


--
-- Name: tenant_features tenant_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_features
    ADD CONSTRAINT tenant_features_pkey PRIMARY KEY (id);


--
-- Name: tenant_features tenant_features_tenant_id_module_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_features
    ADD CONSTRAINT tenant_features_tenant_id_module_key UNIQUE (tenant_id, module);


--
-- Name: tenant_integrations tenant_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_integrations
    ADD CONSTRAINT tenant_integrations_pkey PRIMARY KEY (id);


--
-- Name: tenant_members tenant_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_members
    ADD CONSTRAINT tenant_members_pkey PRIMARY KEY (user_id, tenant_id);


--
-- Name: tenant_payments tenant_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_payments
    ADD CONSTRAINT tenant_payments_pkey PRIMARY KEY (id);


--
-- Name: tenant_settings tenant_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_pkey PRIMARY KEY (tenant_id);


--
-- Name: tenants tenants_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_code_key UNIQUE (code);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: units units_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: user_cash_drawers user_cash_drawers_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cash_drawers
    ADD CONSTRAINT user_cash_drawers_account_id_key UNIQUE (account_id);


--
-- Name: user_cash_drawers user_cash_drawers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cash_drawers
    ADD CONSTRAINT user_cash_drawers_pkey PRIMARY KEY (user_id);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (id);


--
-- Name: user_permissions user_permissions_user_id_module_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_module_key UNIQUE (user_id, module);


--
-- Name: user_prefs user_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_prefs
    ADD CONSTRAINT user_prefs_pkey PRIMARY KEY (user_id);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: ai_drafts_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_drafts_tenant_status ON public.ai_drafts USING btree (tenant_id, status, created_at DESC);


--
-- Name: approval_requests_entity_type_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_requests_entity_type_entity_id_idx ON public.approval_requests USING btree (entity_type, entity_id);


--
-- Name: approval_requests_tenant_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_requests_tenant_id_status_idx ON public.approval_requests USING btree (tenant_id, status);


--
-- Name: banks_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX banks_branch_idx ON public.banks USING btree (branch_id);


--
-- Name: cheques_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cheques_branch_idx ON public.cheques USING btree (branch_id);


--
-- Name: documents_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_branch_idx ON public.documents USING btree (branch_id);


--
-- Name: employees_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employees_branch_idx ON public.employees USING btree (branch_id);


--
-- Name: fixed_assets_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_assets_branch_idx ON public.fixed_assets USING btree (branch_id);


--
-- Name: fx_log_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fx_log_tenant_idx ON public.fx_log USING btree (tenant_id, created_at DESC);


--
-- Name: hotel_reservations_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hotel_reservations_branch_idx ON public.hotel_reservations USING btree (branch_id);


--
-- Name: idx_attach_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attach_entity ON public.attachments USING btree (entity_type, entity_id);


--
-- Name: idx_audit_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_tenant ON public.audit_log USING btree (tenant_id, created_at DESC);


--
-- Name: idx_batch_cons_move; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batch_cons_move ON public.batch_consumptions USING btree (move_id);


--
-- Name: idx_batches_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_expiry ON public.product_batches USING btree (tenant_id, expiry_date);


--
-- Name: idx_batches_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_product ON public.product_batches USING btree (product_id);


--
-- Name: idx_chat_messages_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_tenant ON public.chat_messages USING btree (tenant_id, created_at);


--
-- Name: idx_lines_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lines_account ON public.journal_lines USING btree (account_id);


--
-- Name: idx_lines_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lines_entry ON public.journal_lines USING btree (entry_id);


--
-- Name: idx_mo_materials; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mo_materials ON public.manufacturing_materials USING btree (order_id);


--
-- Name: idx_moves_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moves_product ON public.stock_moves USING btree (product_id);


--
-- Name: idx_pos_shifts_user_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_shifts_user_open ON public.pos_shifts USING btree (user_id) WHERE (closed_at IS NULL);


--
-- Name: idx_recipes_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recipes_product ON public.product_recipes USING btree (product_id);


--
-- Name: idx_res_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_res_room ON public.hotel_reservations USING btree (room_id);


--
-- Name: journal_entries_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_branch_idx ON public.journal_entries USING btree (branch_id);


--
-- Name: journal_entries_one_opening; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX journal_entries_one_opening ON public.journal_entries USING btree (tenant_id) WHERE (doc_type = 'opening'::text);


--
-- Name: journal_lines_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_lines_branch_idx ON public.journal_lines USING btree (branch_id);


--
-- Name: journal_lines_source_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_lines_source_doc_idx ON public.journal_lines USING btree (source_document_id) WHERE (source_document_id IS NOT NULL);


--
-- Name: login_events_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_events_tenant_idx ON public.login_events USING btree (tenant_id, created_at DESC);


--
-- Name: login_events_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_events_user_idx ON public.login_events USING btree (user_id, created_at DESC);


--
-- Name: manufacturing_orders_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX manufacturing_orders_branch_idx ON public.manufacturing_orders USING btree (branch_id);


--
-- Name: owner_finance_entries_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX owner_finance_entries_date_idx ON public.owner_finance_entries USING btree (entry_date DESC);


--
-- Name: owner_finance_entries_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX owner_finance_entries_kind_idx ON public.owner_finance_entries USING btree (kind);


--
-- Name: partner_inquiries_link_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partner_inquiries_link_id_created_at_idx ON public.partner_inquiries USING btree (link_id, created_at);


--
-- Name: payroll_runs_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_runs_branch_idx ON public.payroll_runs USING btree (branch_id);


--
-- Name: pos_shifts_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_shifts_branch_idx ON public.pos_shifts USING btree (branch_id);


--
-- Name: pos_stations_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pos_stations_tenant_idx ON public.pos_stations USING btree (tenant_id);


--
-- Name: products_tenant_type_sku_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_tenant_type_sku_key ON public.products USING btree (tenant_id, item_type, sku);


--
-- Name: project_quotes_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_quotes_project_idx ON public.project_quotes USING btree (project_id);


--
-- Name: project_snags_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_snags_project_idx ON public.project_snags USING btree (project_id);


--
-- Name: project_wbs_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_wbs_project_idx ON public.project_wbs USING btree (project_id);


--
-- Name: projects_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_branch_idx ON public.projects USING btree (branch_id);


--
-- Name: record_comments_tenant_id_entity_type_entity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX record_comments_tenant_id_entity_type_entity_id_idx ON public.record_comments USING btree (tenant_id, entity_type, entity_id);


--
-- Name: solar_monitoring_unique_fleet_station; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX solar_monitoring_unique_fleet_station ON public.solar_monitoring USING btree (fleet_station_id) WHERE (fleet_station_id IS NOT NULL);


--
-- Name: solar_provider_accounts_tenant_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX solar_provider_accounts_tenant_provider ON public.solar_provider_accounts USING btree (tenant_id, provider);


--
-- Name: solar_readings_project_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solar_readings_project_time ON public.solar_readings USING btree (project_id, read_at DESC);


--
-- Name: solar_readings_project_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solar_readings_project_time_idx ON public.solar_readings USING btree (project_id, read_at DESC);


--
-- Name: stock_moves_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_moves_branch_idx ON public.stock_moves USING btree (branch_id);


--
-- Name: support_messages_ticket_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_messages_ticket_id_created_at_idx ON public.support_messages USING btree (ticket_id, created_at);


--
-- Name: telegram_client_links_chat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_client_links_chat_idx ON public.telegram_client_links USING btree (chat_id);


--
-- Name: telegram_client_links_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_client_links_pending_idx ON public.telegram_client_links USING btree (pending_chat_id);


--
-- Name: telegram_client_links_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_client_links_project_idx ON public.telegram_client_links USING btree (project_id);


--
-- Name: telegram_events_member_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX telegram_events_member_time ON public.telegram_member_events USING btree (member_id, created_at DESC);


--
-- Name: telegram_member_system_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX telegram_member_system_user_unique ON public.telegram_team_members USING btree (team_id, system_user_id) WHERE (system_user_id IS NOT NULL);


--
-- Name: tenant_integrations_global_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenant_integrations_global_provider ON public.tenant_integrations USING btree (provider) WHERE (tenant_id IS NULL);


--
-- Name: tenant_integrations_tenant_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tenant_integrations_tenant_provider ON public.tenant_integrations USING btree (tenant_id, provider) WHERE (tenant_id IS NOT NULL);


--
-- Name: warehouses_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warehouses_branch_idx ON public.warehouses USING btree (branch_id);


--
-- Name: banks a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.banks FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: cheques a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.cheques FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: documents a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: employees a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.employees FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: fixed_assets a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.fixed_assets FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: hotel_reservations a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.hotel_reservations FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: journal_entries a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: journal_lines a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: manufacturing_orders a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.manufacturing_orders FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: payroll_runs a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: pos_shifts a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.pos_shifts FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: projects a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: stock_moves a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: warehouses a0_branch_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a0_branch_default BEFORE INSERT ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.branch_default();


--
-- Name: products a_category_tree_safety; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_category_tree_safety BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.category_tree_safety();


--
-- Name: projects a_category_tree_safety; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_category_tree_safety BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.category_tree_safety();


--
-- Name: warehouses a_category_tree_safety; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_category_tree_safety BEFORE INSERT OR UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.category_tree_safety();


--
-- Name: cost_centers a_guard_entity_account_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_guard_entity_account_history BEFORE DELETE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.guard_entity_account_history();


--
-- Name: partners a_guard_entity_account_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_guard_entity_account_history BEFORE DELETE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.guard_entity_account_history();


--
-- Name: projects a_guard_entity_account_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_guard_entity_account_history BEFORE DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.guard_entity_account_history();


--
-- Name: warehouses a_guard_entity_account_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_guard_entity_account_history BEFORE DELETE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.guard_entity_account_history();


--
-- Name: accounts a_guard_linked_account_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_guard_linked_account_delete BEFORE DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.guard_linked_account_delete();


--
-- Name: stock_moves a_stock_moves_no_group_wh; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_stock_moves_no_group_wh BEFORE INSERT ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION public.stock_moves_no_group_wh();


--
-- Name: accounts account_subtree_recode; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER account_subtree_recode BEFORE UPDATE OF code, parent_id ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.account_subtree_recode();


--
-- Name: approval_requests approval_request_after; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_request_after AFTER INSERT ON public.approval_requests FOR EACH ROW EXECUTE FUNCTION public.approval_request_after();


--
-- Name: cost_centers b_entity_auto_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER b_entity_auto_account BEFORE INSERT OR UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.entity_auto_account();


--
-- Name: projects b_entity_auto_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER b_entity_auto_account BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.entity_auto_account();


--
-- Name: warehouses b_entity_auto_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER b_entity_auto_account BEFORE INSERT OR UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.entity_auto_account();


--
-- Name: document_lines document_lines_no_group; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER document_lines_no_group BEFORE INSERT OR UPDATE OF product_id ON public.document_lines FOR EACH ROW EXECUTE FUNCTION public.document_lines_no_group();


--
-- Name: documents fx_rate_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fx_rate_guard BEFORE INSERT OR UPDATE OF currency, exchange_rate ON public.documents FOR EACH ROW EXECUTE FUNCTION public.fx_rate_guard();


--
-- Name: journal_entries fx_rate_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fx_rate_guard BEFORE INSERT OR UPDATE OF currency, exchange_rate ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.fx_rate_guard();


--
-- Name: tenant_settings inventory_method_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_method_guard BEFORE INSERT OR UPDATE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.inventory_method_guard();


--
-- Name: journal_lines journal_lines_partner_currency; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER journal_lines_partner_currency BEFORE INSERT OR UPDATE OF partner_id ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.partner_currency_guard();


--
-- Name: accounts linked_account_currency_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER linked_account_currency_guard BEFORE UPDATE OF currency ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.linked_account_currency_guard();


--
-- Name: partner_inquiries partner_inquiry_after; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER partner_inquiry_after AFTER INSERT ON public.partner_inquiries FOR EACH ROW EXECUTE FUNCTION public.partner_inquiry_after();


--
-- Name: partners partners_auto_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER partners_auto_account BEFORE INSERT OR UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.partner_auto_account();


--
-- Name: personal_notes personal_notes_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER personal_notes_notify BEFORE INSERT OR UPDATE ON public.personal_notes FOR EACH ROW EXECUTE FUNCTION public.notes_notify();


--
-- Name: documents pos_document_cash; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pos_document_cash BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.pos_document_cash();


--
-- Name: products products_category_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_category_guard BEFORE INSERT OR UPDATE OF name, parent_id, is_group ON public.products FOR EACH ROW EXECUTE FUNCTION public.products_category_guard();


--
-- Name: products products_item_type_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_item_type_guard BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.products_item_type_guard();


--
-- Name: products products_service_links; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_service_links BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.products_service_links();


--
-- Name: profiles provision_pos_drawer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER provision_pos_drawer AFTER INSERT OR UPDATE OF account_kind, tenant_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.provision_pos_drawer();


--
-- Name: tenant_settings provision_pos_drawers_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER provision_pos_drawers_settings AFTER INSERT OR UPDATE OF cash_account_id ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.provision_pos_drawer();


--
-- Name: record_comments record_comment_after; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER record_comment_after AFTER INSERT ON public.record_comments FOR EACH ROW EXECUTE FUNCTION public.record_comment_after();


--
-- Name: service_orders service_order_quota; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER service_order_quota AFTER INSERT OR UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.service_order_quota();


--
-- Name: service_orders service_order_sla; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER service_order_sla BEFORE INSERT OR UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.service_order_sla();


--
-- Name: documents service_orders_from_sale; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER service_orders_from_sale AFTER UPDATE OF status ON public.documents FOR EACH ROW EXECUTE FUNCTION public.service_orders_from_sale();


--
-- Name: solar_projects solar_section_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER solar_section_guard BEFORE UPDATE ON public.solar_projects FOR EACH ROW EXECUTE FUNCTION public.solar_section_guard();


--
-- Name: support_messages support_message_after; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER support_message_after AFTER INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION public.support_message_after();


--
-- Name: accounts trg_audit_accounts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_accounts AFTER INSERT OR DELETE OR UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: attachments trg_audit_attachments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_attachments AFTER INSERT OR DELETE OR UPDATE ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: banks trg_audit_banks; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_banks AFTER INSERT OR DELETE OR UPDATE ON public.banks FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: boq_items trg_audit_boq_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_boq_items AFTER INSERT OR DELETE OR UPDATE ON public.boq_items FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: cheques trg_audit_cheques; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_cheques AFTER INSERT OR DELETE OR UPDATE ON public.cheques FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: currencies trg_audit_currencies; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_currencies AFTER INSERT OR DELETE OR UPDATE ON public.currencies FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: document_lines trg_audit_document_lines; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_document_lines AFTER INSERT OR DELETE OR UPDATE ON public.document_lines FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: documents trg_audit_documents; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_documents AFTER INSERT OR DELETE OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: exchange_rates trg_audit_exchange_rates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_exchange_rates AFTER INSERT OR DELETE OR UPDATE ON public.exchange_rates FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: fixed_assets trg_audit_fixed_assets; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_fixed_assets AFTER INSERT OR DELETE OR UPDATE ON public.fixed_assets FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: hotel_reservations trg_audit_hotel_reservations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_hotel_reservations AFTER INSERT OR DELETE OR UPDATE ON public.hotel_reservations FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: hotel_rooms trg_audit_hotel_rooms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_hotel_rooms AFTER INSERT OR DELETE OR UPDATE ON public.hotel_rooms FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: journal_entries trg_audit_journal_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_journal_entries AFTER INSERT OR DELETE OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: journal_lines trg_audit_journal_lines; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_journal_lines AFTER INSERT OR DELETE OR UPDATE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: manufacturing_orders trg_audit_manufacturing_orders; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_manufacturing_orders AFTER INSERT OR DELETE OR UPDATE ON public.manufacturing_orders FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: partners trg_audit_partners; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_partners AFTER INSERT OR DELETE OR UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: product_batches trg_audit_product_batches; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_product_batches AFTER INSERT OR DELETE OR UPDATE ON public.product_batches FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: product_recipes trg_audit_product_recipes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_product_recipes AFTER INSERT OR DELETE OR UPDATE ON public.product_recipes FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: products trg_audit_products; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_products AFTER INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: profiles trg_audit_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_profiles AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: project_expenses trg_audit_project_expenses; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_project_expenses AFTER INSERT OR DELETE OR UPDATE ON public.project_expenses FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: project_milestones trg_audit_project_milestones; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_project_milestones AFTER INSERT OR DELETE OR UPDATE ON public.project_milestones FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: projects trg_audit_projects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_projects AFTER INSERT OR DELETE OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: stock_moves trg_audit_stock_moves; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_stock_moves AFTER INSERT OR DELETE OR UPDATE ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: tenant_settings trg_audit_tenant_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_tenant_settings AFTER INSERT OR DELETE OR UPDATE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: tenants trg_audit_tenants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_tenants AFTER INSERT OR DELETE OR UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: user_permissions trg_audit_user_permissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_user_permissions AFTER INSERT OR DELETE OR UPDATE ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: warehouses trg_audit_warehouses; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_warehouses AFTER INSERT OR DELETE OR UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: tenant_settings trg_base_currency_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_base_currency_lock BEFORE UPDATE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.base_currency_lock();


--
-- Name: stock_moves trg_batch_in; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_batch_in AFTER INSERT ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION public.batches_on_stock_in();


--
-- Name: stock_moves trg_batch_move_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_batch_move_delete BEFORE DELETE ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION public.batches_on_move_delete();


--
-- Name: stock_moves trg_batch_out; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_batch_out AFTER INSERT ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION public.batches_on_stock_out();


--
-- Name: documents trg_block_nonposting_docs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_nonposting_docs BEFORE INSERT OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.block_nonposting_docs();


--
-- Name: currencies trg_currency_delete_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_currency_delete_guard BEFORE DELETE ON public.currencies FOR EACH ROW EXECUTE FUNCTION public.currency_delete_guard();


--
-- Name: document_lines trg_document_lines_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_document_lines_guard BEFORE INSERT OR DELETE OR UPDATE ON public.document_lines FOR EACH ROW EXECUTE FUNCTION public.document_lines_guard();


--
-- Name: documents trg_documents_before; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_documents_before BEFORE INSERT OR DELETE OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.documents_before();


--
-- Name: documents trg_enforce_primary_pattern_access; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_primary_pattern_access BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.enforce_primary_pattern_access();


--
-- Name: journal_lines trg_entry_balanced; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_entry_balanced AFTER INSERT OR DELETE OR UPDATE ON public.journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_entry_balanced();


--
-- Name: journal_entries trg_entry_no; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_entry_no BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.set_entry_no();


--
-- Name: exchange_rates trg_fx_rate_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fx_rate_log AFTER INSERT OR UPDATE OF rate_to_usd ON public.exchange_rates FOR EACH ROW EXECUTE FUNCTION public.fx_rate_log();


--
-- Name: documents trg_guard_doc_period; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_doc_period BEFORE INSERT OR DELETE OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_doc_period();


--
-- Name: journal_entries trg_guard_entry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_entry BEFORE INSERT OR DELETE OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_entry();


--
-- Name: journal_entries trg_guard_opening_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_opening_delete BEFORE DELETE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_opening_delete();


--
-- Name: journal_lines trg_guard_source_lines; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_source_lines BEFORE INSERT OR DELETE OR UPDATE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.guard_source_lines();


--
-- Name: accounts trg_lock_monetary; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lock_monetary BEFORE UPDATE OF is_monetary ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.lock_monetary_after_moves();


--
-- Name: manufacturing_orders trg_mo_no; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mo_no BEFORE INSERT ON public.manufacturing_orders FOR EACH ROW EXECUTE FUNCTION public.set_mo_no();


--
-- Name: accounts trg_no_delete_accounts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_no_delete_accounts BEFORE DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.block_delete_with_history();


--
-- Name: partners trg_no_delete_partners; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_no_delete_partners BEFORE DELETE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.block_delete_with_history();


--
-- Name: products trg_no_delete_products; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_no_delete_products BEFORE DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.block_delete_with_history();


--
-- Name: projects trg_no_delete_projects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_no_delete_projects BEFORE DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.block_delete_with_history();


--
-- Name: warehouses trg_no_delete_warehouses; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_no_delete_warehouses BEFORE DELETE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.block_delete_with_history();


--
-- Name: cheques trg_notify_cheques; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_cheques AFTER INSERT ON public.cheques FOR EACH ROW EXECUTE FUNCTION public.notify_events();


--
-- Name: documents trg_notify_documents; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_documents AFTER INSERT OR UPDATE OF status ON public.documents FOR EACH ROW EXECUTE FUNCTION public.notify_events();


--
-- Name: journal_entries trg_notify_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_entries AFTER UPDATE OF audited ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.notify_events();


--
-- Name: payroll_runs trg_notify_payroll; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_payroll AFTER INSERT ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.notify_events();


--
-- Name: products trg_notify_products; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_products AFTER UPDATE OF qty_on_hand ON public.products FOR EACH ROW EXECUTE FUNCTION public.notify_events();


--
-- Name: products trg_products_price_rules; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_price_rules BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.products_apply_price_rules();


--
-- Name: profiles trg_profile_self_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profile_self_guard BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profile_self_guard();


--
-- Name: profiles trg_profiles_default_perms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_default_perms AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.grant_default_permissions();


--
-- Name: project_wbs trg_project_wbs_rollup; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_project_wbs_rollup AFTER INSERT OR DELETE OR UPDATE OF progress, weight, parent_id ON public.project_wbs FOR EACH ROW EXECUTE FUNCTION public.project_wbs_rollup();


--
-- Name: tenants trg_purge_attachments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purge_attachments BEFORE DELETE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.purge_attachments_on_clear();


--
-- Name: stock_moves trg_recipe_consume; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recipe_consume AFTER INSERT ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION public.recipe_consume_on_sale();


--
-- Name: stock_moves trg_stock_move; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_move BEFORE INSERT OR DELETE OR UPDATE ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION public.apply_stock_move();


--
-- Name: profiles trg_sync_tenant_member; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_tenant_member AFTER INSERT OR UPDATE OF tenant_id, is_tenant_admin, is_auditor, account_kind ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_member();


--
-- Name: solar_monitoring trg_telegram_auto_add_station; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_telegram_auto_add_station AFTER INSERT OR UPDATE OF project_id ON public.solar_monitoring FOR EACH ROW EXECUTE FUNCTION public.telegram_auto_add_station();


--
-- Name: tenant_settings validate_closing_account_links; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_closing_account_links BEFORE INSERT OR UPDATE OF closing_account_links ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.validate_closing_account_links();


--
-- Name: products validate_initial_quantity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_initial_quantity BEFORE INSERT OR UPDATE OF initial_quantity, is_group ON public.products FOR EACH ROW EXECUTE FUNCTION public.validate_initial_quantity();


--
-- Name: warehouses warehouses_tree_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER warehouses_tree_guard BEFORE INSERT OR UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.warehouses_tree_guard();


--
-- Name: cost_centers z_cleanup_generated_entity_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_cleanup_generated_entity_account AFTER DELETE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.cleanup_generated_entity_account();


--
-- Name: partners z_cleanup_generated_entity_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_cleanup_generated_entity_account AFTER DELETE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.cleanup_generated_entity_account();


--
-- Name: projects z_cleanup_generated_entity_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_cleanup_generated_entity_account AFTER DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.cleanup_generated_entity_account();


--
-- Name: warehouses z_cleanup_generated_entity_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_cleanup_generated_entity_account AFTER DELETE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.cleanup_generated_entity_account();


--
-- Name: partners z_sync_entity_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_sync_entity_account AFTER UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.sync_entity_account();


--
-- Name: warehouses z_sync_entity_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER z_sync_entity_account AFTER UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.sync_entity_account();


--
-- Name: accounts accounts_closing_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_closing_account_id_fkey FOREIGN KEY (closing_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: accounts accounts_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: accounts accounts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: ai_drafts ai_drafts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_drafts
    ADD CONSTRAINT ai_drafts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: ai_messages ai_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.ai_threads(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: approval_requests approval_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: assembly_vouchers assembly_vouchers_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assembly_vouchers
    ADD CONSTRAINT assembly_vouchers_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: assembly_vouchers assembly_vouchers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assembly_vouchers
    ADD CONSTRAINT assembly_vouchers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) DEFERRABLE;


--
-- Name: assembly_vouchers assembly_vouchers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assembly_vouchers
    ADD CONSTRAINT assembly_vouchers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: assembly_vouchers assembly_vouchers_to_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assembly_vouchers
    ADD CONSTRAINT assembly_vouchers_to_warehouse_id_fkey FOREIGN KEY (to_warehouse_id) REFERENCES public.warehouses(id) DEFERRABLE;


--
-- Name: assembly_vouchers assembly_vouchers_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assembly_vouchers
    ADD CONSTRAINT assembly_vouchers_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) DEFERRABLE;


--
-- Name: attachments attachments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: backups backups_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backups
    ADD CONSTRAINT backups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: bank_recon_marks bank_recon_marks_journal_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_recon_marks
    ADD CONSTRAINT bank_recon_marks_journal_line_id_fkey FOREIGN KEY (journal_line_id) REFERENCES public.journal_lines(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: banks banks_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banks
    ADD CONSTRAINT banks_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: banks banks_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banks
    ADD CONSTRAINT banks_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: banks banks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banks
    ADD CONSTRAINT banks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: batch_consumptions batch_consumptions_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_consumptions
    ADD CONSTRAINT batch_consumptions_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.product_batches(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: batch_consumptions batch_consumptions_move_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_consumptions
    ADD CONSTRAINT batch_consumptions_move_id_fkey FOREIGN KEY (move_id) REFERENCES public.stock_moves(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: batch_consumptions batch_consumptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_consumptions
    ADD CONSTRAINT batch_consumptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: boq_items boq_items_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boq_items
    ADD CONSTRAINT boq_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: boq_items boq_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boq_items
    ADD CONSTRAINT boq_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: branches branches_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: chat_messages chat_messages_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: chat_messages chat_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: cheques cheques_bank_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheques
    ADD CONSTRAINT cheques_bank_id_fkey FOREIGN KEY (bank_id) REFERENCES public.banks(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: cheques cheques_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheques
    ADD CONSTRAINT cheques_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: cheques cheques_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheques
    ADD CONSTRAINT cheques_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: cheques cheques_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheques
    ADD CONSTRAINT cheques_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: cost_centers cost_centers_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: cost_centers cost_centers_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.cost_centers(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: cost_centers cost_centers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: currencies currencies_gain_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_gain_account_id_fkey FOREIGN KEY (gain_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: currencies currencies_loss_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_loss_account_id_fkey FOREIGN KEY (loss_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: currencies currencies_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: doc_patterns doc_patterns_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doc_patterns
    ADD CONSTRAINT doc_patterns_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: document_lines document_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_lines
    ADD CONSTRAINT document_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT DEFERRABLE;


--
-- Name: document_lines document_lines_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_lines
    ADD CONSTRAINT document_lines_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: document_lines document_lines_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_lines
    ADD CONSTRAINT document_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) DEFERRABLE;


--
-- Name: document_lines document_lines_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_lines
    ADD CONSTRAINT document_lines_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: document_lines document_lines_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_lines
    ADD CONSTRAINT document_lines_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) DEFERRABLE;


--
-- Name: documents documents_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: documents documents_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: documents documents_cash_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_cash_account_id_fkey FOREIGN KEY (cash_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: documents documents_final_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_final_warehouse_id_fkey FOREIGN KEY (final_warehouse_id) REFERENCES public.warehouses(id) DEFERRABLE;


--
-- Name: documents documents_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: documents documents_partner_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_partner_account_id_fkey FOREIGN KEY (partner_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: documents documents_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) DEFERRABLE;


--
-- Name: documents documents_pattern_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pattern_id_fkey FOREIGN KEY (pattern_id) REFERENCES public.doc_patterns(id) ON DELETE SET NULL;


--
-- Name: documents documents_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) DEFERRABLE;


--
-- Name: documents documents_received_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_received_document_id_fkey FOREIGN KEY (received_document_id) REFERENCES public.documents(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: documents documents_settles_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_settles_document_id_fkey FOREIGN KEY (settles_document_id) REFERENCES public.documents(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: documents documents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: documents documents_to_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_to_warehouse_id_fkey FOREIGN KEY (to_warehouse_id) REFERENCES public.warehouses(id) DEFERRABLE;


--
-- Name: documents documents_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) DEFERRABLE;


--
-- Name: employee_adjustments employee_adjustments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_adjustments
    ADD CONSTRAINT employee_adjustments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: employee_adjustments employee_adjustments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_adjustments
    ADD CONSTRAINT employee_adjustments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: employee_advances employee_advances_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: employee_advances employee_advances_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: employee_leaves employee_leaves_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leaves
    ADD CONSTRAINT employee_leaves_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: employee_leaves employee_leaves_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_leaves
    ADD CONSTRAINT employee_leaves_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: employees employees_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: employees employees_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: employees employees_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: employees employees_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: exchange_rates exchange_rates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: fixed_assets fixed_assets_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: fixed_assets fixed_assets_accum_dep_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_accum_dep_account_id_fkey FOREIGN KEY (accum_dep_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: fixed_assets fixed_assets_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: fixed_assets fixed_assets_dep_expense_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_dep_expense_account_id_fkey FOREIGN KEY (dep_expense_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: fixed_assets fixed_assets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: fx_log fx_log_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_log
    ADD CONSTRAINT fx_log_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: fx_log fx_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_log
    ADD CONSTRAINT fx_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: hotel_reservations hotel_reservations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_reservations
    ADD CONSTRAINT hotel_reservations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: hotel_reservations hotel_reservations_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_reservations
    ADD CONSTRAINT hotel_reservations_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) DEFERRABLE;


--
-- Name: hotel_reservations hotel_reservations_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_reservations
    ADD CONSTRAINT hotel_reservations_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.hotel_rooms(id) DEFERRABLE;


--
-- Name: hotel_reservations hotel_reservations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_reservations
    ADD CONSTRAINT hotel_reservations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: hotel_rooms hotel_rooms_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_rooms
    ADD CONSTRAINT hotel_rooms_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: journal_entries journal_entries_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: journal_entries journal_entries_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: journal_entries journal_entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: journal_lines journal_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT DEFERRABLE;


--
-- Name: journal_lines journal_lines_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: journal_lines journal_lines_cost_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id) DEFERRABLE;


--
-- Name: journal_lines journal_lines_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: journal_lines journal_lines_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: journal_lines journal_lines_project_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_project_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: journal_lines journal_lines_source_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES public.documents(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: journal_lines journal_lines_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: manufacturing_byproducts manufacturing_byproducts_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_byproducts
    ADD CONSTRAINT manufacturing_byproducts_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.manufacturing_orders(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: manufacturing_byproducts manufacturing_byproducts_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_byproducts
    ADD CONSTRAINT manufacturing_byproducts_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) DEFERRABLE;


--
-- Name: manufacturing_materials manufacturing_materials_component_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_materials
    ADD CONSTRAINT manufacturing_materials_component_product_id_fkey FOREIGN KEY (component_product_id) REFERENCES public.products(id) DEFERRABLE;


--
-- Name: manufacturing_materials manufacturing_materials_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_materials
    ADD CONSTRAINT manufacturing_materials_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.manufacturing_orders(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: manufacturing_materials manufacturing_materials_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_materials
    ADD CONSTRAINT manufacturing_materials_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: manufacturing_orders manufacturing_orders_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_orders
    ADD CONSTRAINT manufacturing_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: manufacturing_orders manufacturing_orders_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_orders
    ADD CONSTRAINT manufacturing_orders_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) DEFERRABLE;


--
-- Name: manufacturing_orders manufacturing_orders_overhead_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_orders
    ADD CONSTRAINT manufacturing_orders_overhead_account_id_fkey FOREIGN KEY (overhead_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: manufacturing_orders manufacturing_orders_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_orders
    ADD CONSTRAINT manufacturing_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) DEFERRABLE;


--
-- Name: manufacturing_orders manufacturing_orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_orders
    ADD CONSTRAINT manufacturing_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: manufacturing_orders manufacturing_orders_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_orders
    ADD CONSTRAINT manufacturing_orders_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) DEFERRABLE;


--
-- Name: manufacturing_orders manufacturing_orders_wip_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_orders
    ADD CONSTRAINT manufacturing_orders_wip_account_id_fkey FOREIGN KEY (wip_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: manufacturing_orders manufacturing_orders_wip_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_orders
    ADD CONSTRAINT manufacturing_orders_wip_entry_id_fkey FOREIGN KEY (wip_entry_id) REFERENCES public.journal_entries(id) DEFERRABLE;


--
-- Name: notification_reads notification_reads_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: notifications notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: partner_inquiries partner_inquiries_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_inquiries
    ADD CONSTRAINT partner_inquiries_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.share_links(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: partner_inquiries partner_inquiries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_inquiries
    ADD CONSTRAINT partner_inquiries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: partners partners_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: partners partners_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.partners(id) DEFERRABLE;


--
-- Name: partners partners_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: payroll_runs payroll_runs_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: payroll_runs payroll_runs_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: payroll_runs payroll_runs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: pos_shifts pos_shifts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_shifts
    ADD CONSTRAINT pos_shifts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: pos_shifts pos_shifts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_shifts
    ADD CONSTRAINT pos_shifts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: pos_shifts pos_shifts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_shifts
    ADD CONSTRAINT pos_shifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: pos_stations pos_stations_cash_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_stations
    ADD CONSTRAINT pos_stations_cash_account_id_fkey FOREIGN KEY (cash_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: pos_stations pos_stations_default_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_stations
    ADD CONSTRAINT pos_stations_default_partner_id_fkey FOREIGN KEY (default_partner_id) REFERENCES public.partners(id) ON DELETE SET NULL;


--
-- Name: pos_stations pos_stations_pattern_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_stations
    ADD CONSTRAINT pos_stations_pattern_id_fkey FOREIGN KEY (pattern_id) REFERENCES public.doc_patterns(id) ON DELETE SET NULL;


--
-- Name: pos_stations pos_stations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_stations
    ADD CONSTRAINT pos_stations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: pos_stations pos_stations_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_stations
    ADD CONSTRAINT pos_stations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;


--
-- Name: product_batches product_batches_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_batches
    ADD CONSTRAINT product_batches_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: product_batches product_batches_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_batches
    ADD CONSTRAINT product_batches_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) DEFERRABLE;


--
-- Name: product_batches product_batches_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_batches
    ADD CONSTRAINT product_batches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: product_batches product_batches_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_batches
    ADD CONSTRAINT product_batches_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) DEFERRABLE;


--
-- Name: product_recipes product_recipes_component_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recipes
    ADD CONSTRAINT product_recipes_component_product_id_fkey FOREIGN KEY (component_product_id) REFERENCES public.products(id) DEFERRABLE;


--
-- Name: product_recipes product_recipes_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recipes
    ADD CONSTRAINT product_recipes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) DEFERRABLE;


--
-- Name: product_recipes product_recipes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recipes
    ADD CONSTRAINT product_recipes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: products products_cost_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: products products_cost_center_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_cost_center_parent_id_fkey FOREIGN KEY (cost_center_parent_id) REFERENCES public.cost_centers(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: products products_default_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_default_warehouse_id_fkey FOREIGN KEY (default_warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: products products_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.products(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: products products_service_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_service_account_id_fkey FOREIGN KEY (service_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: products products_service_account_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_service_account_parent_id_fkey FOREIGN KEY (service_account_parent_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: products products_service_expense_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_service_expense_account_id_fkey FOREIGN KEY (service_expense_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: products products_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: profiles profiles_active_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_active_branch_id_fkey FOREIGN KEY (active_branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: profiles profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: profiles profiles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: project_bom project_bom_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bom
    ADD CONSTRAINT project_bom_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: project_bom project_bom_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bom
    ADD CONSTRAINT project_bom_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: project_bom project_bom_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bom
    ADD CONSTRAINT project_bom_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: project_expenses project_expenses_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_expenses
    ADD CONSTRAINT project_expenses_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: project_expenses project_expenses_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_expenses
    ADD CONSTRAINT project_expenses_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: project_expenses project_expenses_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_expenses
    ADD CONSTRAINT project_expenses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: project_milestones project_milestones_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: project_milestones project_milestones_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: project_quotes project_quotes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_quotes
    ADD CONSTRAINT project_quotes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: project_quotes project_quotes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_quotes
    ADD CONSTRAINT project_quotes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: project_snags project_snags_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_snags
    ADD CONSTRAINT project_snags_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: project_snags project_snags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_snags
    ADD CONSTRAINT project_snags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: project_templates project_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_templates
    ADD CONSTRAINT project_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: project_wbs project_wbs_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_wbs
    ADD CONSTRAINT project_wbs_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.project_wbs(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: project_wbs project_wbs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_wbs
    ADD CONSTRAINT project_wbs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: project_wbs project_wbs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_wbs
    ADD CONSTRAINT project_wbs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: projects projects_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: projects projects_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: projects projects_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.partners(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: projects projects_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.projects(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: projects projects_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: record_comments record_comments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_comments
    ADD CONSTRAINT record_comments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: recurring_entries recurring_entries_credit_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_entries
    ADD CONSTRAINT recurring_entries_credit_account_id_fkey FOREIGN KEY (credit_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: recurring_entries recurring_entries_debit_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_entries
    ADD CONSTRAINT recurring_entries_debit_account_id_fkey FOREIGN KEY (debit_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: recurring_entries recurring_entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_entries
    ADD CONSTRAINT recurring_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: service_contracts service_contracts_last_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_contracts
    ADD CONSTRAINT service_contracts_last_document_id_fkey FOREIGN KEY (last_document_id) REFERENCES public.documents(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: service_contracts service_contracts_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_contracts
    ADD CONSTRAINT service_contracts_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: service_contracts service_contracts_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_contracts
    ADD CONSTRAINT service_contracts_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: service_contracts service_contracts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_contracts
    ADD CONSTRAINT service_contracts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: service_orders service_orders_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT service_orders_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.service_contracts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: service_orders service_orders_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT service_orders_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: service_orders service_orders_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT service_orders_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: service_orders service_orders_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT service_orders_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: service_orders service_orders_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT service_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: service_orders service_orders_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT service_orders_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: service_orders service_orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT service_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: share_links share_links_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: solar_fleet_stations solar_fleet_stations_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_fleet_stations
    ADD CONSTRAINT solar_fleet_stations_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.solar_provider_accounts(id) DEFERRABLE;


--
-- Name: solar_fleet_stations solar_fleet_stations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_fleet_stations
    ADD CONSTRAINT solar_fleet_stations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: solar_monitoring solar_monitoring_fleet_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_monitoring
    ADD CONSTRAINT solar_monitoring_fleet_station_id_fkey FOREIGN KEY (fleet_station_id) REFERENCES public.solar_fleet_stations(id) DEFERRABLE;


--
-- Name: solar_monitoring solar_monitoring_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_monitoring
    ADD CONSTRAINT solar_monitoring_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: solar_projects solar_projects_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_projects
    ADD CONSTRAINT solar_projects_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: solar_projects solar_projects_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_projects
    ADD CONSTRAINT solar_projects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: solar_provider_accounts solar_provider_accounts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_provider_accounts
    ADD CONSTRAINT solar_provider_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: solar_readings solar_readings_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_readings
    ADD CONSTRAINT solar_readings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: solar_roles solar_roles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_roles
    ADD CONSTRAINT solar_roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: stock_moves stock_moves_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_moves
    ADD CONSTRAINT stock_moves_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: stock_moves stock_moves_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_moves
    ADD CONSTRAINT stock_moves_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: stock_moves stock_moves_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_moves
    ADD CONSTRAINT stock_moves_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: stock_moves stock_moves_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_moves
    ADD CONSTRAINT stock_moves_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT DEFERRABLE;


--
-- Name: stock_moves stock_moves_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_moves
    ADD CONSTRAINT stock_moves_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: stock_moves stock_moves_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_moves
    ADD CONSTRAINT stock_moves_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: stock_moves stock_moves_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_moves
    ADD CONSTRAINT stock_moves_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT DEFERRABLE;


--
-- Name: subscription_history subscription_history_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_history
    ADD CONSTRAINT subscription_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: support_messages support_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: support_tickets support_tickets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: telegram_client_links telegram_client_links_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_client_links
    ADD CONSTRAINT telegram_client_links_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: telegram_client_links telegram_client_links_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_client_links
    ADD CONSTRAINT telegram_client_links_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: telegram_deliveries telegram_deliveries_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_deliveries
    ADD CONSTRAINT telegram_deliveries_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.telegram_team_members(id) DEFERRABLE;


--
-- Name: telegram_join_sessions telegram_join_sessions_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_join_sessions
    ADD CONSTRAINT telegram_join_sessions_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.telegram_teams(id) ON DELETE CASCADE;


--
-- Name: telegram_links telegram_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_links
    ADD CONSTRAINT telegram_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: telegram_member_events telegram_member_events_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_member_events
    ADD CONSTRAINT telegram_member_events_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.telegram_team_members(id) ON DELETE CASCADE;


--
-- Name: telegram_member_events telegram_member_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_member_events
    ADD CONSTRAINT telegram_member_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: telegram_team_members telegram_team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_team_members
    ADD CONSTRAINT telegram_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.telegram_teams(id) DEFERRABLE;


--
-- Name: telegram_team_members telegram_team_members_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_team_members
    ADD CONSTRAINT telegram_team_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: telegram_team_projects telegram_team_projects_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_team_projects
    ADD CONSTRAINT telegram_team_projects_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: telegram_team_projects telegram_team_projects_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_team_projects
    ADD CONSTRAINT telegram_team_projects_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.telegram_teams(id) DEFERRABLE;


--
-- Name: telegram_team_projects telegram_team_projects_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_team_projects
    ADD CONSTRAINT telegram_team_projects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: telegram_teams telegram_teams_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_teams
    ADD CONSTRAINT telegram_teams_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: tenant_features tenant_features_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_features
    ADD CONSTRAINT tenant_features_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: tenant_integrations tenant_integrations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_integrations
    ADD CONSTRAINT tenant_integrations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_members tenant_members_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_members
    ADD CONSTRAINT tenant_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: tenant_members tenant_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_members
    ADD CONSTRAINT tenant_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: tenant_payments tenant_payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_payments
    ADD CONSTRAINT tenant_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_accum_dep_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_accum_dep_account_id_fkey FOREIGN KEY (accum_dep_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_advances_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_advances_account_id_fkey FOREIGN KEY (advances_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_capital_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_capital_account_id_fkey FOREIGN KEY (capital_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_cash_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_cash_account_id_fkey FOREIGN KEY (cash_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_cogs_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_cogs_account_id_fkey FOREIGN KEY (cogs_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_customers_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_customers_account_id_fkey FOREIGN KEY (customers_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_dep_expense_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_dep_expense_account_id_fkey FOREIGN KEY (dep_expense_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_fx_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_fx_account_id_fkey FOREIGN KEY (fx_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_fx_gain_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_fx_gain_account_id_fkey FOREIGN KEY (fx_gain_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_fx_loss_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_fx_loss_account_id_fkey FOREIGN KEY (fx_loss_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_inventory_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_inventory_account_id_fkey FOREIGN KEY (inventory_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_inventory_adjust_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_inventory_adjust_account_id_fkey FOREIGN KEY (inventory_adjust_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_notes_payable_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_notes_payable_account_id_fkey FOREIGN KEY (notes_payable_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_notes_receivable_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_notes_receivable_account_id_fkey FOREIGN KEY (notes_receivable_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_project_cost_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_project_cost_account_id_fkey FOREIGN KEY (project_cost_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_purchase_discount_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_purchase_discount_account_id_fkey FOREIGN KEY (purchase_discount_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_purchase_freight_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_purchase_freight_account_id_fkey FOREIGN KEY (purchase_freight_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_purchases_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_purchases_account_id_fkey FOREIGN KEY (purchases_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_retained_earnings_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_retained_earnings_account_id_fkey FOREIGN KEY (retained_earnings_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_salaries_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_salaries_account_id_fkey FOREIGN KEY (salaries_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_sales_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_sales_account_id_fkey FOREIGN KEY (sales_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_sales_discount_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_sales_discount_account_id_fkey FOREIGN KEY (sales_discount_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_sales_freight_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_sales_freight_account_id_fkey FOREIGN KEY (sales_freight_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_stock_shortage_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_stock_shortage_account_id_fkey FOREIGN KEY (stock_shortage_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_stock_surplus_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_stock_surplus_account_id_fkey FOREIGN KEY (stock_surplus_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_suppliers_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_suppliers_account_id_fkey FOREIGN KEY (suppliers_account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: tenant_settings tenant_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: units units_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: user_cash_drawers user_cash_drawers_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cash_drawers
    ADD CONSTRAINT user_cash_drawers_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) DEFERRABLE;


--
-- Name: user_cash_drawers user_cash_drawers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cash_drawers
    ADD CONSTRAINT user_cash_drawers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) DEFERRABLE;


--
-- Name: user_cash_drawers user_cash_drawers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cash_drawers
    ADD CONSTRAINT user_cash_drawers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: user_permissions user_permissions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: warehouses warehouses_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: warehouses warehouses_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: warehouses warehouses_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.warehouses(id) ON DELETE SET NULL DEFERRABLE;


--
-- Name: warehouses warehouses_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: owner_finance_entries Owner finance delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner finance delete" ON public.owner_finance_entries FOR DELETE TO authenticated USING (public.is_super_admin());


--
-- Name: owner_finance_entries Owner finance insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner finance insert" ON public.owner_finance_entries FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());


--
-- Name: owner_finance_entries Owner finance read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner finance read" ON public.owner_finance_entries FOR SELECT TO authenticated USING (public.is_super_admin());


--
-- Name: owner_finance_entries Owner finance update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner finance update" ON public.owner_finance_entries FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: tenant_payments Super admin manages payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin manages payments" ON public.tenant_payments TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: _probe; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public._probe ENABLE ROW LEVEL SECURITY;

--
-- Name: _restore_req; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public._restore_req ENABLE ROW LEVEL SECURITY;

--
-- Name: _stg_auth_identities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public._stg_auth_identities ENABLE ROW LEVEL SECURITY;

--
-- Name: _stg_auth_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public._stg_auth_users ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts accounts_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_del ON public.accounts FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'delete'::public.perm_action)));


--
-- Name: accounts accounts_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_ins ON public.accounts FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'create'::public.perm_action)));


--
-- Name: accounts accounts_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_sel ON public.accounts FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'view'::public.perm_action))));


--
-- Name: accounts accounts_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_upd ON public.accounts FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: ai_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_drafts ai_drafts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_drafts_delete ON public.ai_drafts FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (status = 'pending'::text)));


--
-- Name: ai_drafts ai_drafts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_drafts_insert ON public.ai_drafts FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (created_by = auth.uid()) AND (status = 'pending'::text)));


--
-- Name: ai_drafts ai_drafts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_drafts_select ON public.ai_drafts FOR SELECT TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: ai_drafts ai_drafts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_drafts_update ON public.ai_drafts FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: ai_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_messages aim_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aim_own ON public.ai_messages TO authenticated USING ((user_id = auth.uid())) WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.ai_threads t
  WHERE ((t.id = ai_messages.thread_id) AND (t.user_id = auth.uid()))))));


--
-- Name: ai_threads ait_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ait_own ON public.ai_threads TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: app_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_requests ar_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ar_insert ON public.approval_requests FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (requested_by = auth.uid()) AND (status = 'pending'::text)));


--
-- Name: approval_requests ar_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ar_select ON public.approval_requests FOR SELECT TO authenticated USING ((public.is_super_admin() OR (tenant_id = public.current_tenant_id())));


--
-- Name: assembly_vouchers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assembly_vouchers ENABLE ROW LEVEL SECURITY;

--
-- Name: assembly_vouchers assembly_vouchers_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assembly_vouchers_read ON public.assembly_vouchers FOR SELECT TO authenticated USING (((tenant_id = public.my_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('stock'::text, 'view'::public.perm_action))));


--
-- Name: attachments att_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY att_del ON public.attachments FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm(public.attach_module(entity_type), 'delete'::public.perm_action)));


--
-- Name: attachments att_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY att_ins ON public.attachments FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (public.has_perm(public.attach_module(entity_type), 'create'::public.perm_action) OR public.has_perm(public.attach_module(entity_type), 'edit'::public.perm_action))));


--
-- Name: attachments att_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY att_sel ON public.attachments FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm(public.attach_module(entity_type), 'view'::public.perm_action))));


--
-- Name: attachments att_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY att_upd ON public.attachments FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm(public.attach_module(entity_type), 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_select ON public.audit_log FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('audit'::text, 'view'::public.perm_action))));


--
-- Name: backups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_recon_marks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_recon_marks ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_recon_marks bank_recon_marks_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bank_recon_marks_rw ON public.bank_recon_marks TO authenticated USING ((tenant_id = public.my_tenant_id())) WITH CHECK ((tenant_id = public.my_tenant_id()));


--
-- Name: banks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;

--
-- Name: banks banks_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banks_del ON public.banks FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('cheques'::text, 'delete'::public.perm_action)));


--
-- Name: banks banks_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banks_ins ON public.banks FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('cheques'::text, 'create'::public.perm_action)));


--
-- Name: banks banks_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banks_sel ON public.banks FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('cheques'::text, 'view'::public.perm_action))));


--
-- Name: banks banks_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY banks_upd ON public.banks FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('cheques'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: batch_consumptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.batch_consumptions ENABLE ROW LEVEL SECURITY;

--
-- Name: batch_consumptions bc_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bc_all ON public.batch_consumptions TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'view'::public.perm_action)))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'create'::public.perm_action)));


--
-- Name: project_bom bom_section_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bom_section_delete ON public.project_bom AS RESTRICTIVE FOR DELETE TO authenticated USING (public.project_section_ok('procurement'::text, 'delete'::public.perm_action));


--
-- Name: project_bom bom_section_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bom_section_insert ON public.project_bom AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.project_section_ok('procurement'::text, 'create'::public.perm_action));


--
-- Name: project_bom bom_section_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bom_section_select ON public.project_bom AS RESTRICTIVE FOR SELECT TO authenticated USING (public.project_section_ok('procurement'::text, 'view'::public.perm_action));


--
-- Name: project_bom bom_section_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bom_section_update ON public.project_bom AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.project_section_ok('procurement'::text, 'edit'::public.perm_action));


--
-- Name: boq_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.boq_items ENABLE ROW LEVEL SECURITY;

--
-- Name: boq_items boq_items_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY boq_items_del ON public.boq_items FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'delete'::public.perm_action)));


--
-- Name: boq_items boq_items_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY boq_items_ins ON public.boq_items FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'create'::public.perm_action)));


--
-- Name: boq_items boq_items_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY boq_items_sel ON public.boq_items FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'view'::public.perm_action))));


--
-- Name: boq_items boq_items_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY boq_items_upd ON public.boq_items FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: banks branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.banks AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: cheques branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.cheques AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: documents branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.documents AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: employees branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.employees AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: fixed_assets branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.fixed_assets AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: hotel_reservations branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.hotel_reservations AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: journal_entries branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.journal_entries AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: journal_lines branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.journal_lines AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: manufacturing_orders branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.manufacturing_orders AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: payroll_runs branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.payroll_runs AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: pos_shifts branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.pos_shifts AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: projects branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.projects AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: stock_moves branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.stock_moves AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: warehouses branch_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_scope ON public.warehouses AS RESTRICTIVE TO authenticated USING (public.can_see_branch(branch_id)) WITH CHECK (public.can_see_branch(branch_id));


--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- Name: branches branches_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_sel ON public.branches FOR SELECT TO authenticated USING ((public.is_super_admin() OR (tenant_id = public.current_tenant_id())));


--
-- Name: branches branches_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_write ON public.branches TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin())) WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: chat_messages chat_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_ins ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (sender_id = auth.uid())));


--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages chat_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_sel ON public.chat_messages FOR SELECT TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: cheques; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;

--
-- Name: cheques cheques_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cheques_del ON public.cheques FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('cheques'::text, 'delete'::public.perm_action)));


--
-- Name: cheques cheques_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cheques_ins ON public.cheques FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('cheques'::text, 'create'::public.perm_action)));


--
-- Name: cheques cheques_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cheques_sel ON public.cheques FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('cheques'::text, 'view'::public.perm_action))));


--
-- Name: cheques cheques_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cheques_upd ON public.cheques FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('cheques'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: cost_centers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

--
-- Name: cost_centers cost_centers_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_centers_del ON public.cost_centers FOR DELETE USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'delete'::public.perm_action)));


--
-- Name: cost_centers cost_centers_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_centers_ins ON public.cost_centers FOR INSERT WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'create'::public.perm_action)));


--
-- Name: cost_centers cost_centers_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_centers_sel ON public.cost_centers FOR SELECT USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'view'::public.perm_action))));


--
-- Name: cost_centers cost_centers_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cost_centers_upd ON public.cost_centers FOR UPDATE USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: currencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

--
-- Name: currencies currencies_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_del ON public.currencies FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'delete'::public.perm_action)));


--
-- Name: currencies currencies_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_ins ON public.currencies FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'create'::public.perm_action)));


--
-- Name: currencies currencies_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_sel ON public.currencies FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'view'::public.perm_action))));


--
-- Name: currencies currencies_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY currencies_upd ON public.currencies FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: document_lines dl_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dl_del ON public.document_lines FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (public.has_perm('documents'::text, 'edit'::public.perm_action) OR public.has_perm('documents'::text, 'delete'::public.perm_action))));


--
-- Name: document_lines dl_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dl_ins ON public.document_lines FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'create'::public.perm_action)));


--
-- Name: document_lines dl_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dl_sel ON public.document_lines FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'view'::public.perm_action))));


--
-- Name: document_lines dl_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dl_upd ON public.document_lines FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: doc_patterns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.doc_patterns ENABLE ROW LEVEL SECURITY;

--
-- Name: document_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: documents documents_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_del ON public.documents FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'delete'::public.perm_action)));


--
-- Name: documents documents_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_ins ON public.documents FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'create'::public.perm_action)));


--
-- Name: documents documents_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_sel ON public.documents FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'view'::public.perm_action))));


--
-- Name: documents documents_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_upd ON public.documents FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: doc_patterns dp_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dp_delete ON public.doc_patterns FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('settings'::text, 'edit'::public.perm_action))));


--
-- Name: doc_patterns dp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dp_insert ON public.doc_patterns FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('settings'::text, 'edit'::public.perm_action))));


--
-- Name: doc_patterns dp_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dp_select ON public.doc_patterns FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) AND ((cardinality(allowed_user_ids) = 0) OR (auth.uid() = ANY (allowed_user_ids)) OR public.is_tenant_admin() OR public.has_perm('settings'::text, 'edit'::public.perm_action))));


--
-- Name: doc_patterns dp_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dp_update ON public.doc_patterns FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('settings'::text, 'edit'::public.perm_action))));


--
-- Name: user_cash_drawers drawer_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY drawer_read ON public.user_cash_drawers FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR ((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()) OR public.is_super_admin()));


--
-- Name: employee_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_advances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_advances employee_advances delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "employee_advances delete" ON public.employee_advances FOR DELETE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: employee_advances employee_advances insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "employee_advances insert" ON public.employee_advances FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: employee_advances employee_advances read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "employee_advances read" ON public.employee_advances FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_super_admin()));


--
-- Name: employee_advances employee_advances update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "employee_advances update" ON public.employee_advances FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: employee_leaves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_leaves ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: employees employees delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "employees delete" ON public.employees FOR DELETE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: employees employees insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "employees insert" ON public.employees FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: employees employees read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "employees read" ON public.employees FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_super_admin()));


--
-- Name: employees employees update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "employees update" ON public.employees FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: exchange_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_rates exchange_rates_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rates_del ON public.exchange_rates FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'delete'::public.perm_action)));


--
-- Name: exchange_rates exchange_rates_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rates_ins ON public.exchange_rates FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'create'::public.perm_action)));


--
-- Name: exchange_rates exchange_rates_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rates_sel ON public.exchange_rates FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'view'::public.perm_action))));


--
-- Name: exchange_rates exchange_rates_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rates_upd ON public.exchange_rates FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('accounts'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: solar_fault_analyses fault_analysis_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fault_analysis_tenant_read ON public.solar_fault_analyses FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'view'::public.perm_action)));


--
-- Name: fixed_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: fixed_assets fixed_assets_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fixed_assets_del ON public.fixed_assets FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('assets'::text, 'delete'::public.perm_action)));


--
-- Name: fixed_assets fixed_assets_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fixed_assets_ins ON public.fixed_assets FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('assets'::text, 'create'::public.perm_action)));


--
-- Name: fixed_assets fixed_assets_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fixed_assets_sel ON public.fixed_assets FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('assets'::text, 'view'::public.perm_action))));


--
-- Name: fixed_assets fixed_assets_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fixed_assets_upd ON public.fixed_assets FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('assets'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: solar_provider_accounts fleet_account_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fleet_account_read ON public.solar_provider_accounts FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'view'::public.perm_action)));


--
-- Name: solar_fleet_stations fleet_station_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fleet_station_read ON public.solar_fleet_stations FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'view'::public.perm_action)));


--
-- Name: fx_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fx_log ENABLE ROW LEVEL SECURITY;

--
-- Name: fx_log fx_log_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fx_log_sel ON public.fx_log FOR SELECT TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: hotel_reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hotel_reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: hotel_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hotel_rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: hotel_rooms hr_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hr_del ON public.hotel_rooms FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'delete'::public.perm_action)));


--
-- Name: hotel_rooms hr_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hr_ins ON public.hotel_rooms FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'create'::public.perm_action)));


--
-- Name: hotel_rooms hr_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hr_sel ON public.hotel_rooms FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'view'::public.perm_action))));


--
-- Name: hotel_rooms hr_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hr_upd ON public.hotel_rooms FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: hotel_reservations hres_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hres_del ON public.hotel_reservations FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'delete'::public.perm_action)));


--
-- Name: hotel_reservations hres_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hres_ins ON public.hotel_reservations FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'create'::public.perm_action)));


--
-- Name: hotel_reservations hres_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hres_sel ON public.hotel_reservations FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'view'::public.perm_action))));


--
-- Name: hotel_reservations hres_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hres_upd ON public.hotel_reservations FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('documents'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: journal_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_entries journal_entries_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entries_del ON public.journal_entries FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('journal'::text, 'delete'::public.perm_action)));


--
-- Name: journal_entries journal_entries_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entries_ins ON public.journal_entries FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('journal'::text, 'create'::public.perm_action)));


--
-- Name: journal_entries journal_entries_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entries_sel ON public.journal_entries FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('journal'::text, 'view'::public.perm_action))));


--
-- Name: journal_entries journal_entries_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entries_upd ON public.journal_entries FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('journal'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: journal_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_lines journal_lines_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_lines_del ON public.journal_lines FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('journal'::text, 'delete'::public.perm_action)));


--
-- Name: journal_lines journal_lines_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_lines_ins ON public.journal_lines FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('journal'::text, 'create'::public.perm_action)));


--
-- Name: journal_lines journal_lines_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_lines_sel ON public.journal_lines FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('journal'::text, 'view'::public.perm_action))));


--
-- Name: journal_lines journal_lines_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_lines_upd ON public.journal_lines FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('journal'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: login_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

--
-- Name: login_events login_events_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY login_events_insert_own ON public.login_events FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: login_events login_events_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY login_events_read ON public.login_events FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_super_admin() OR (public.is_tenant_admin() AND (tenant_id = public.current_tenant_id()))));


--
-- Name: manufacturing_byproducts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.manufacturing_byproducts ENABLE ROW LEVEL SECURITY;

--
-- Name: manufacturing_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.manufacturing_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: manufacturing_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.manufacturing_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: manufacturing_byproducts mfg_byproducts_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mfg_byproducts_rw ON public.manufacturing_byproducts TO authenticated USING ((tenant_id = public.my_tenant_id())) WITH CHECK ((tenant_id = public.my_tenant_id()));


--
-- Name: manufacturing_materials mm_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mm_del ON public.manufacturing_materials FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'delete'::public.perm_action)));


--
-- Name: manufacturing_materials mm_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mm_ins ON public.manufacturing_materials FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'create'::public.perm_action)));


--
-- Name: manufacturing_materials mm_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mm_sel ON public.manufacturing_materials FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'view'::public.perm_action))));


--
-- Name: manufacturing_materials mm_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mm_upd ON public.manufacturing_materials FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: manufacturing_orders mo_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mo_del ON public.manufacturing_orders FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'delete'::public.perm_action)));


--
-- Name: manufacturing_orders mo_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mo_ins ON public.manufacturing_orders FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'create'::public.perm_action)));


--
-- Name: manufacturing_orders mo_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mo_sel ON public.manufacturing_orders FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'view'::public.perm_action))));


--
-- Name: manufacturing_orders mo_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mo_upd ON public.manufacturing_orders FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: project_milestones ms_section_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ms_section_delete ON public.project_milestones AS RESTRICTIVE FOR DELETE TO authenticated USING (public.project_section_ok('finance'::text, 'delete'::public.perm_action));


--
-- Name: project_milestones ms_section_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ms_section_insert ON public.project_milestones AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.project_section_ok('finance'::text, 'create'::public.perm_action));


--
-- Name: project_milestones ms_section_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ms_section_select ON public.project_milestones AS RESTRICTIVE FOR SELECT TO authenticated USING (public.project_section_ok('finance'::text, 'view'::public.perm_action));


--
-- Name: project_milestones ms_section_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ms_section_update ON public.project_milestones AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.project_section_ok('finance'::text, 'edit'::public.perm_action));


--
-- Name: personal_notes notes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notes_delete ON public.personal_notes FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: personal_notes notes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notes_insert ON public.personal_notes FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND ((assigned_to IS NULL) OR (assigned_to IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.tenant_id = public.my_tenant_id()))))));


--
-- Name: personal_notes notes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notes_select ON public.personal_notes FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (assigned_to = auth.uid())));


--
-- Name: personal_notes notes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notes_update ON public.personal_notes FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR (assigned_to = auth.uid())));


--
-- Name: notifications notif_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_select ON public.notifications FOR SELECT TO authenticated USING ((((user_id IS NULL) OR (user_id = auth.uid())) AND (public.is_super_admin() OR (tenant_id IS NULL) OR (tenant_id = public.current_tenant_id()))));


--
-- Name: notifications notif_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_write ON public.notifications TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: notification_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: user_prefs own prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own prefs" ON public.user_prefs TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: notification_reads own reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own reads" ON public.notification_reads TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: owner_finance_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.owner_finance_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: partner_inquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partner_inquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: partners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

--
-- Name: partners partners_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partners_del ON public.partners FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('partners'::text, 'delete'::public.perm_action)));


--
-- Name: partners partners_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partners_ins ON public.partners FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('partners'::text, 'create'::public.perm_action)));


--
-- Name: partners partners_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partners_sel ON public.partners FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('partners'::text, 'view'::public.perm_action))));


--
-- Name: partners partners_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partners_upd ON public.partners FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('partners'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: payroll_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_runs payroll_runs delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payroll_runs delete" ON public.payroll_runs FOR DELETE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: payroll_runs payroll_runs insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payroll_runs insert" ON public.payroll_runs FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: payroll_runs payroll_runs read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payroll_runs read" ON public.payroll_runs FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_super_admin()));


--
-- Name: payroll_runs payroll_runs update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payroll_runs update" ON public.payroll_runs FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: product_batches pb_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pb_del ON public.product_batches FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'delete'::public.perm_action)));


--
-- Name: product_batches pb_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pb_ins ON public.product_batches FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'create'::public.perm_action)));


--
-- Name: product_batches pb_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pb_sel ON public.product_batches FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'view'::public.perm_action))));


--
-- Name: product_batches pb_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pb_upd ON public.product_batches FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: personal_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.personal_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: partner_inquiries pi_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pi_insert ON public.partner_inquiries FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (from_partner = false) AND (created_by = auth.uid())));


--
-- Name: partner_inquiries pi_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pi_select ON public.partner_inquiries FOR SELECT TO authenticated USING ((public.is_super_admin() OR (tenant_id = public.current_tenant_id())));


--
-- Name: pos_shifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_shifts ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_shifts pos_shifts_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_shifts_ins ON public.pos_shifts FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (user_id = auth.uid())));


--
-- Name: pos_shifts pos_shifts_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_shifts_sel ON public.pos_shifts FOR SELECT TO authenticated USING ((public.is_super_admin() OR (tenant_id = public.current_tenant_id())));


--
-- Name: pos_shifts pos_shifts_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_shifts_upd ON public.pos_shifts FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (user_id = auth.uid()))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: pos_stations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_stations ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_stations pos_stations_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_stations_admin ON public.pos_stations TO authenticated USING (((tenant_id = public.my_tenant_id()) AND public.is_tenant_admin())) WITH CHECK (((tenant_id = public.my_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: pos_stations pos_stations_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_stations_read ON public.pos_stations FOR SELECT TO authenticated USING (((tenant_id = public.my_tenant_id()) AND (public.is_tenant_admin() OR (auth.uid() = ANY (allowed_user_ids)) OR (cardinality(allowed_user_ids) = 0))));


--
-- Name: product_recipes pr_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pr_del ON public.product_recipes FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('products'::text, 'delete'::public.perm_action)));


--
-- Name: product_recipes pr_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pr_ins ON public.product_recipes FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('products'::text, 'create'::public.perm_action)));


--
-- Name: product_recipes pr_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pr_sel ON public.product_recipes FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('products'::text, 'view'::public.perm_action))));


--
-- Name: product_recipes pr_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pr_upd ON public.product_recipes FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('products'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: product_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: product_recipes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_recipes ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_del ON public.products FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('products'::text, 'delete'::public.perm_action)));


--
-- Name: products products_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_ins ON public.products FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('products'::text, 'create'::public.perm_action)));


--
-- Name: products products_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_sel ON public.products FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('products'::text, 'view'::public.perm_action))));


--
-- Name: products products_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_upd ON public.products FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('products'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated USING (public.is_super_admin());


--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR public.is_super_admin() OR (tenant_id = public.current_tenant_id())));


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('users'::text, 'edit'::public.perm_action) AND (id <> auth.uid())))) WITH CHECK ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND (is_super_admin = false))));


--
-- Name: project_bom; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_bom ENABLE ROW LEVEL SECURITY;

--
-- Name: project_bom project_bom_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_bom_del ON public.project_bom FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'delete'::public.perm_action)));


--
-- Name: project_bom project_bom_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_bom_ins ON public.project_bom FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (public.has_perm('projects'::text, 'create'::public.perm_action) OR public.has_perm('projects'::text, 'edit'::public.perm_action))));


--
-- Name: project_bom project_bom_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_bom_sel ON public.project_bom FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'view'::public.perm_action))));


--
-- Name: project_bom project_bom_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_bom_upd ON public.project_bom FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: project_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: project_expenses project_expenses_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_expenses_del ON public.project_expenses FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'delete'::public.perm_action)));


--
-- Name: project_expenses project_expenses_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_expenses_ins ON public.project_expenses FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'create'::public.perm_action)));


--
-- Name: project_expenses project_expenses_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_expenses_sel ON public.project_expenses FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'view'::public.perm_action))));


--
-- Name: project_expenses project_expenses_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_expenses_upd ON public.project_expenses FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: project_milestones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

--
-- Name: project_milestones project_milestones_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_milestones_del ON public.project_milestones FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'delete'::public.perm_action)));


--
-- Name: project_milestones project_milestones_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_milestones_ins ON public.project_milestones FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'create'::public.perm_action)));


--
-- Name: project_milestones project_milestones_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_milestones_sel ON public.project_milestones FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'view'::public.perm_action))));


--
-- Name: project_milestones project_milestones_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_milestones_upd ON public.project_milestones FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: project_quotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_quotes ENABLE ROW LEVEL SECURITY;

--
-- Name: project_snags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_snags ENABLE ROW LEVEL SECURITY;

--
-- Name: project_snags project_snags_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_snags_del ON public.project_snags FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'delete'::public.perm_action)));


--
-- Name: project_snags project_snags_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_snags_ins ON public.project_snags FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (public.has_perm('projects'::text, 'create'::public.perm_action) OR public.has_perm('projects'::text, 'edit'::public.perm_action))));


--
-- Name: project_snags project_snags_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_snags_sel ON public.project_snags FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'view'::public.perm_action))));


--
-- Name: project_snags project_snags_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_snags_upd ON public.project_snags FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: project_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: project_wbs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_wbs ENABLE ROW LEVEL SECURITY;

--
-- Name: project_wbs project_wbs_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_wbs_del ON public.project_wbs FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'delete'::public.perm_action)));


--
-- Name: project_wbs project_wbs_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_wbs_ins ON public.project_wbs FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (public.has_perm('projects'::text, 'create'::public.perm_action) OR public.has_perm('projects'::text, 'edit'::public.perm_action))));


--
-- Name: project_wbs project_wbs_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_wbs_sel ON public.project_wbs FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'view'::public.perm_action))));


--
-- Name: project_wbs project_wbs_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_wbs_upd ON public.project_wbs FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_del ON public.projects FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'delete'::public.perm_action)));


--
-- Name: projects projects_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_ins ON public.projects FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'create'::public.perm_action)));


--
-- Name: projects projects_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_sel ON public.projects FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'view'::public.perm_action))));


--
-- Name: projects projects_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_upd ON public.projects FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: project_templates pt_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pt_delete ON public.project_templates FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('projects'::text, 'delete'::public.perm_action))));


--
-- Name: project_templates pt_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pt_insert ON public.project_templates FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('projects'::text, 'create'::public.perm_action))));


--
-- Name: project_templates pt_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pt_select ON public.project_templates FOR SELECT TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: project_templates pt_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pt_update ON public.project_templates FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('projects'::text, 'edit'::public.perm_action))));


--
-- Name: project_quotes quote_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quote_delete ON public.project_quotes FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.project_section_ok('finance'::text, 'delete'::public.perm_action) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_quotes.project_id) AND (p.tenant_id = project_quotes.tenant_id))))));


--
-- Name: project_quotes quote_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quote_insert ON public.project_quotes FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (created_by = auth.uid()) AND public.project_section_ok('finance'::text, 'create'::public.perm_action) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_quotes.project_id) AND (p.tenant_id = project_quotes.tenant_id))))));


--
-- Name: project_quotes quote_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quote_select ON public.project_quotes FOR SELECT TO authenticated USING ((((tenant_id = public.current_tenant_id()) OR public.is_super_admin()) AND public.project_section_ok('finance'::text, 'view'::public.perm_action) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_quotes.project_id) AND (p.tenant_id = project_quotes.tenant_id))))));


--
-- Name: project_quotes quote_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quote_update ON public.project_quotes FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.project_section_ok('finance'::text, 'edit'::public.perm_action) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_quotes.project_id) AND (p.tenant_id = project_quotes.tenant_id)))))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.project_section_ok('finance'::text, 'edit'::public.perm_action) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = project_quotes.project_id) AND (p.tenant_id = project_quotes.tenant_id))))));


--
-- Name: record_comments rc_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rc_delete ON public.record_comments FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND ((created_by = auth.uid()) OR public.is_tenant_admin())));


--
-- Name: record_comments rc_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rc_insert ON public.record_comments FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (created_by = auth.uid())));


--
-- Name: record_comments rc_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rc_select ON public.record_comments FOR SELECT TO authenticated USING ((public.is_super_admin() OR (tenant_id = public.current_tenant_id())));


--
-- Name: record_comments rc_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rc_update ON public.record_comments FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: record_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.record_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recurring_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring_entries recurring_entries delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recurring_entries delete" ON public.recurring_entries FOR DELETE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: recurring_entries recurring_entries insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recurring_entries insert" ON public.recurring_entries FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: recurring_entries recurring_entries read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recurring_entries read" ON public.recurring_entries FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_super_admin()));


--
-- Name: recurring_entries recurring_entries update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recurring_entries update" ON public.recurring_entries FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: restored_user_passwords; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.restored_user_passwords ENABLE ROW LEVEL SECURITY;

--
-- Name: restored_user_passwords rup_owner_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rup_owner_delete ON public.restored_user_passwords FOR DELETE TO authenticated USING (public.is_super_admin());


--
-- Name: restored_user_passwords rup_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rup_owner_select ON public.restored_user_passwords FOR SELECT TO authenticated USING (public.is_super_admin());


--
-- Name: service_contracts sc_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sc_del ON public.service_contracts FOR DELETE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: service_contracts sc_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sc_ins ON public.service_contracts FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: service_contracts sc_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sc_sel ON public.service_contracts FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_super_admin()));


--
-- Name: service_contracts sc_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sc_upd ON public.service_contracts FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: service_contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: service_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_history sh_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sh_select ON public.subscription_history FOR SELECT TO authenticated USING ((public.is_super_admin() OR (tenant_id = public.current_tenant_id())));


--
-- Name: subscription_history sh_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sh_write ON public.subscription_history TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: share_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: share_links sl_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sl_insert ON public.share_links FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (created_by = auth.uid())));


--
-- Name: share_links sl_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sl_select ON public.share_links FOR SELECT TO authenticated USING ((public.is_super_admin() OR (tenant_id = public.current_tenant_id())));


--
-- Name: share_links sl_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sl_update ON public.share_links FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: support_messages sm_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sm_insert ON public.support_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND (is_staff = public.is_super_admin()) AND (EXISTS ( SELECT 1
   FROM public.support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND (public.is_super_admin() OR (t.tenant_id = public.current_tenant_id())))))));


--
-- Name: support_messages sm_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sm_select ON public.support_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND (public.is_super_admin() OR (t.tenant_id = public.current_tenant_id()))))));


--
-- Name: service_orders so_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY so_del ON public.service_orders FOR DELETE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: service_orders so_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY so_ins ON public.service_orders FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: service_orders so_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY so_sel ON public.service_orders FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_super_admin()));


--
-- Name: service_orders so_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY so_upd ON public.service_orders FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: solar_ai_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solar_ai_access ENABLE ROW LEVEL SECURITY;

--
-- Name: solar_fault_analyses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solar_fault_analyses ENABLE ROW LEVEL SECURITY;

--
-- Name: solar_fleet_stations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solar_fleet_stations ENABLE ROW LEVEL SECURITY;

--
-- Name: solar_monitoring; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solar_monitoring ENABLE ROW LEVEL SECURITY;

--
-- Name: solar_monitoring solar_monitoring_project_scope; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solar_monitoring_project_scope ON public.solar_monitoring AS RESTRICTIVE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = solar_monitoring.project_id) AND (p.tenant_id = solar_monitoring.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = solar_monitoring.project_id) AND (p.tenant_id = solar_monitoring.tenant_id)))));


--
-- Name: solar_monitoring solar_monitoring_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solar_monitoring_sel ON public.solar_monitoring FOR SELECT TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: solar_monitoring solar_monitoring_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solar_monitoring_write ON public.solar_monitoring TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('projects'::text, 'edit'::public.perm_action)))) WITH CHECK (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('projects'::text, 'edit'::public.perm_action))));


--
-- Name: solar_performance_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solar_performance_flags ENABLE ROW LEVEL SECURITY;

--
-- Name: solar_performance_flags solar_performance_flags_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solar_performance_flags_read ON public.solar_performance_flags FOR SELECT TO authenticated USING ((tenant_id = ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE (p.id = auth.uid()))));


--
-- Name: solar_projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solar_projects ENABLE ROW LEVEL SECURITY;

--
-- Name: solar_projects solar_projects_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solar_projects_del ON public.solar_projects FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'delete'::public.perm_action)));


--
-- Name: solar_projects solar_projects_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solar_projects_ins ON public.solar_projects FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'create'::public.perm_action)));


--
-- Name: solar_projects solar_projects_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solar_projects_sel ON public.solar_projects FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'view'::public.perm_action))));


--
-- Name: solar_projects solar_projects_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solar_projects_upd ON public.solar_projects FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('projects'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: solar_provider_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solar_provider_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: solar_readings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solar_readings ENABLE ROW LEVEL SECURITY;

--
-- Name: solar_readings solar_readings_no_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solar_readings_no_write ON public.solar_readings FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: solar_readings solar_readings_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solar_readings_sel ON public.solar_readings FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = solar_readings.project_id) AND (p.tenant_id = solar_readings.tenant_id))))));


--
-- Name: solar_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solar_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: solar_roles solar_roles_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solar_roles_admin ON public.solar_roles TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin())) WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: solar_roles solar_roles_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solar_roles_sel ON public.solar_roles FOR SELECT TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: support_tickets st_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY st_insert ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (created_by = auth.uid())));


--
-- Name: support_tickets st_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY st_select ON public.support_tickets FOR SELECT TO authenticated USING ((public.is_super_admin() OR (tenant_id = public.current_tenant_id())));


--
-- Name: support_tickets st_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY st_update ON public.support_tickets FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (tenant_id = public.current_tenant_id())));


--
-- Name: stock_moves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_moves ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_moves stock_moves_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_moves_del ON public.stock_moves FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'delete'::public.perm_action)));


--
-- Name: stock_moves stock_moves_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_moves_ins ON public.stock_moves FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'create'::public.perm_action)));


--
-- Name: stock_moves stock_moves_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_moves_sel ON public.stock_moves FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'view'::public.perm_action))));


--
-- Name: stock_moves stock_moves_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_moves_upd ON public.stock_moves FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('stock'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: attachments study_files_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY study_files_delete ON public.attachments AS RESTRICTIVE FOR DELETE TO authenticated USING (((entity_type <> 'project'::text) OR (attach_type <> ALL (ARRAY['survey:technical_offer'::text, 'survey:drawings'::text])) OR public.project_section_ok('survey'::text, 'delete'::public.perm_action)));


--
-- Name: attachments study_files_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY study_files_insert ON public.attachments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (((entity_type <> 'project'::text) OR (attach_type <> ALL (ARRAY['survey:technical_offer'::text, 'survey:drawings'::text])) OR (public.project_section_ok('survey'::text, 'create'::public.perm_action) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = attachments.entity_id) AND (p.tenant_id = attachments.tenant_id)))))));


--
-- Name: attachments study_files_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY study_files_select ON public.attachments AS RESTRICTIVE FOR SELECT TO authenticated USING (((entity_type <> 'project'::text) OR (attach_type <> ALL (ARRAY['survey:technical_offer'::text, 'survey:drawings'::text])) OR (public.project_section_ok('survey'::text, 'view'::public.perm_action) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = attachments.entity_id) AND (p.tenant_id = attachments.tenant_id)))))));


--
-- Name: attachments study_files_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY study_files_update ON public.attachments AS RESTRICTIVE FOR UPDATE TO authenticated USING (((entity_type <> 'project'::text) OR (attach_type <> ALL (ARRAY['survey:technical_offer'::text, 'survey:drawings'::text])) OR public.project_section_ok('survey'::text, 'edit'::public.perm_action))) WITH CHECK (((entity_type <> 'project'::text) OR (attach_type <> ALL (ARRAY['survey:technical_offer'::text, 'survey:drawings'::text])) OR public.project_section_ok('survey'::text, 'edit'::public.perm_action)));


--
-- Name: subscription_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

--
-- Name: support_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: system_branding system branding readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "system branding readable" ON public.system_branding FOR SELECT TO authenticated, anon USING (true);


--
-- Name: system_branding system branding super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "system branding super admin write" ON public.system_branding TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: system_branding; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_branding ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_team_members team_members_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_members_admin_read ON public.telegram_team_members FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.is_super_admin()) AND public.has_perm('projects'::text, 'view'::public.perm_action)));


--
-- Name: telegram_team_projects team_projects_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_projects_admin_read ON public.telegram_team_projects FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.is_super_admin()) AND (EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = telegram_team_projects.project_id) AND (p.tenant_id = p.tenant_id))))));


--
-- Name: telegram_client_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_client_links ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_member_events telegram_events_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telegram_events_admin_read ON public.telegram_member_events FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.is_super_admin()) AND public.has_perm('projects'::text, 'view'::public.perm_action)));


--
-- Name: telegram_join_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_join_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_links telegram_links_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telegram_links_own ON public.telegram_links FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: telegram_member_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_member_events ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_team_projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_team_projects ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_teams ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_adjustments tenant adjustments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant adjustments" ON public.employee_adjustments TO authenticated USING (((tenant_id = public.my_tenant_id()) OR public.is_super_admin())) WITH CHECK (((tenant_id = public.my_tenant_id()) OR public.is_super_admin()));


--
-- Name: telegram_client_links tenant admins delete client links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant admins delete client links" ON public.telegram_client_links FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('projects'::text, 'edit'::public.perm_action))));


--
-- Name: telegram_client_links tenant admins read client links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant admins read client links" ON public.telegram_client_links FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('projects'::text, 'edit'::public.perm_action))));


--
-- Name: telegram_client_links tenant admins update client links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant admins update client links" ON public.telegram_client_links FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('projects'::text, 'edit'::public.perm_action)))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: backups tenant backups read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant backups read" ON public.backups FOR SELECT TO authenticated USING (((tenant_id = public.my_tenant_id()) OR public.is_super_admin()));


--
-- Name: shared_drafts tenant drafts delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant drafts delete" ON public.shared_drafts FOR DELETE TO authenticated USING ((tenant_id = public.my_tenant_id()));


--
-- Name: shared_drafts tenant drafts insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant drafts insert" ON public.shared_drafts FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.my_tenant_id()) AND (created_by = auth.uid())));


--
-- Name: shared_drafts tenant drafts read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant drafts read" ON public.shared_drafts FOR SELECT TO authenticated USING ((tenant_id = public.my_tenant_id()));


--
-- Name: shared_drafts tenant drafts update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant drafts update" ON public.shared_drafts FOR UPDATE TO authenticated USING ((tenant_id = public.my_tenant_id())) WITH CHECK ((tenant_id = public.my_tenant_id()));


--
-- Name: employee_leaves tenant leaves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant leaves" ON public.employee_leaves TO authenticated USING (((tenant_id = public.my_tenant_id()) OR public.is_super_admin())) WITH CHECK (((tenant_id = public.my_tenant_id()) OR public.is_super_admin()));


--
-- Name: tenant_features; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_members tenant_members_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_members_sel ON public.tenant_members FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_super_admin()));


--
-- Name: tenant_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants tenants_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenants_select ON public.tenants FOR SELECT TO authenticated USING ((public.is_super_admin() OR (id = public.current_tenant_id())));


--
-- Name: tenants tenants_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenants_write ON public.tenants TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: tenant_features tf_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tf_select ON public.tenant_features FOR SELECT TO authenticated USING ((public.is_super_admin() OR (tenant_id = public.current_tenant_id())));


--
-- Name: tenant_features tf_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tf_write ON public.tenant_features TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: tenant_settings ts_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ts_ins ON public.tenant_settings FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('accounts'::text, 'edit'::public.perm_action))));


--
-- Name: tenant_settings ts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ts_select ON public.tenant_settings FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.tenant_active())));


--
-- Name: tenant_settings ts_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ts_upd ON public.tenant_settings FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND (public.is_tenant_admin() OR public.has_perm('accounts'::text, 'edit'::public.perm_action)))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

--
-- Name: units units tenant delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "units tenant delete" ON public.units FOR DELETE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: units units tenant insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "units tenant insert" ON public.units FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: units units tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "units tenant read" ON public.units FOR SELECT TO authenticated USING (((tenant_id = public.current_tenant_id()) OR public.is_super_admin()));


--
-- Name: units units tenant update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "units tenant update" ON public.units FOR UPDATE TO authenticated USING ((tenant_id = public.current_tenant_id()));


--
-- Name: user_permissions up_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY up_select ON public.user_permissions FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_super_admin() OR (tenant_id = public.current_tenant_id())));


--
-- Name: user_permissions up_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY up_write ON public.user_permissions TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('users'::text, 'edit'::public.perm_action)))) WITH CHECK ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('users'::text, 'edit'::public.perm_action))));


--
-- Name: user_cash_drawers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_cash_drawers ENABLE ROW LEVEL SECURITY;

--
-- Name: user_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_prefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_prefs ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouses warehouses_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_del ON public.warehouses FOR DELETE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('warehouses'::text, 'delete'::public.perm_action)));


--
-- Name: warehouses warehouses_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_ins ON public.warehouses FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.current_tenant_id()) AND public.has_perm('warehouses'::text, 'create'::public.perm_action)));


--
-- Name: warehouses warehouses_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_sel ON public.warehouses FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((tenant_id = public.current_tenant_id()) AND public.has_perm('warehouses'::text, 'view'::public.perm_action))));


--
-- Name: warehouses warehouses_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_upd ON public.warehouses FOR UPDATE TO authenticated USING (((tenant_id = public.current_tenant_id()) AND public.has_perm('warehouses'::text, 'edit'::public.perm_action))) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: project_wbs wbs_section_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wbs_section_delete ON public.project_wbs AS RESTRICTIVE FOR DELETE TO authenticated USING (public.project_section_ok(section, 'delete'::public.perm_action));


--
-- Name: project_wbs wbs_section_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wbs_section_insert ON public.project_wbs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.project_section_ok(section, 'create'::public.perm_action));


--
-- Name: project_wbs wbs_section_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wbs_section_select ON public.project_wbs AS RESTRICTIVE FOR SELECT TO authenticated USING (public.project_section_ok(section, 'view'::public.perm_action));


--
-- Name: project_wbs wbs_section_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wbs_section_update ON public.project_wbs AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.project_section_ok(section, 'edit'::public.perm_action));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION _fill_defaults(_t text, _row jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public._fill_defaults(_t text, _row jsonb) TO anon;
GRANT ALL ON FUNCTION public._fill_defaults(_t text, _row jsonb) TO authenticated;
GRANT ALL ON FUNCTION public._fill_defaults(_t text, _row jsonb) TO service_role;


--
-- Name: FUNCTION _remap_row(j jsonb, _t uuid, _defer text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public._remap_row(j jsonb, _t uuid, _defer text[]) TO anon;
GRANT ALL ON FUNCTION public._remap_row(j jsonb, _t uuid, _defer text[]) TO authenticated;
GRANT ALL ON FUNCTION public._remap_row(j jsonb, _t uuid, _defer text[]) TO service_role;


--
-- Name: FUNCTION _restore_guard(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public._restore_guard(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public._restore_guard(_id uuid) TO service_role;


--
-- Name: FUNCTION _restore_remap(_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public._restore_remap(_data jsonb) TO anon;
GRANT ALL ON FUNCTION public._restore_remap(_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public._restore_remap(_data jsonb) TO service_role;


--
-- Name: FUNCTION _restore_remap_val(v jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public._restore_remap_val(v jsonb) TO anon;
GRANT ALL ON FUNCTION public._restore_remap_val(v jsonb) TO authenticated;
GRANT ALL ON FUNCTION public._restore_remap_val(v jsonb) TO service_role;


--
-- Name: FUNCTION account_subtree_recode(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.account_subtree_recode() TO anon;
GRANT ALL ON FUNCTION public.account_subtree_recode() TO authenticated;
GRANT ALL ON FUNCTION public.account_subtree_recode() TO service_role;


--
-- Name: FUNCTION add_currency(_code text, _name text, _symbol text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.add_currency(_code text, _name text, _symbol text) TO anon;
GRANT ALL ON FUNCTION public.add_currency(_code text, _name text, _symbol text) TO authenticated;
GRANT ALL ON FUNCTION public.add_currency(_code text, _name text, _symbol text) TO service_role;


--
-- Name: FUNCTION apply_stock_move(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.apply_stock_move() TO anon;
GRANT ALL ON FUNCTION public.apply_stock_move() TO authenticated;
GRANT ALL ON FUNCTION public.apply_stock_move() TO service_role;


--
-- Name: FUNCTION approval_request_after(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.approval_request_after() TO anon;
GRANT ALL ON FUNCTION public.approval_request_after() TO authenticated;
GRANT ALL ON FUNCTION public.approval_request_after() TO service_role;


--
-- Name: FUNCTION attach_module(_t text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.attach_module(_t text) TO anon;
GRANT ALL ON FUNCTION public.attach_module(_t text) TO authenticated;
GRANT ALL ON FUNCTION public.attach_module(_t text) TO service_role;


--
-- Name: FUNCTION audit_row(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_row() TO anon;
GRANT ALL ON FUNCTION public.audit_row() TO authenticated;
GRANT ALL ON FUNCTION public.audit_row() TO service_role;


--
-- Name: FUNCTION base_currency_lock(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.base_currency_lock() TO anon;
GRANT ALL ON FUNCTION public.base_currency_lock() TO authenticated;
GRANT ALL ON FUNCTION public.base_currency_lock() TO service_role;


--
-- Name: FUNCTION batches_on_move_delete(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.batches_on_move_delete() TO anon;
GRANT ALL ON FUNCTION public.batches_on_move_delete() TO authenticated;
GRANT ALL ON FUNCTION public.batches_on_move_delete() TO service_role;


--
-- Name: FUNCTION batches_on_stock_in(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.batches_on_stock_in() TO anon;
GRANT ALL ON FUNCTION public.batches_on_stock_in() TO authenticated;
GRANT ALL ON FUNCTION public.batches_on_stock_in() TO service_role;


--
-- Name: FUNCTION batches_on_stock_out(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.batches_on_stock_out() TO anon;
GRANT ALL ON FUNCTION public.batches_on_stock_out() TO authenticated;
GRANT ALL ON FUNCTION public.batches_on_stock_out() TO service_role;


--
-- Name: FUNCTION block_delete_with_history(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.block_delete_with_history() TO anon;
GRANT ALL ON FUNCTION public.block_delete_with_history() TO authenticated;
GRANT ALL ON FUNCTION public.block_delete_with_history() TO service_role;


--
-- Name: FUNCTION block_nonposting_docs(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.block_nonposting_docs() TO anon;
GRANT ALL ON FUNCTION public.block_nonposting_docs() TO authenticated;
GRANT ALL ON FUNCTION public.block_nonposting_docs() TO service_role;


--
-- Name: FUNCTION branch_default(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.branch_default() TO anon;
GRANT ALL ON FUNCTION public.branch_default() TO authenticated;
GRANT ALL ON FUNCTION public.branch_default() TO service_role;


--
-- Name: FUNCTION can_see_branch(_b uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_see_branch(_b uuid) TO anon;
GRANT ALL ON FUNCTION public.can_see_branch(_b uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_see_branch(_b uuid) TO service_role;


--
-- Name: FUNCTION category_tree_safety(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.category_tree_safety() TO anon;
GRANT ALL ON FUNCTION public.category_tree_safety() TO authenticated;
GRANT ALL ON FUNCTION public.category_tree_safety() TO service_role;


--
-- Name: FUNCTION check_entry_balanced(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_entry_balanced() TO anon;
GRANT ALL ON FUNCTION public.check_entry_balanced() TO authenticated;
GRANT ALL ON FUNCTION public.check_entry_balanced() TO service_role;


--
-- Name: FUNCTION claim_operating_device(_device text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.claim_operating_device(_device text) TO anon;
GRANT ALL ON FUNCTION public.claim_operating_device(_device text) TO authenticated;
GRANT ALL ON FUNCTION public.claim_operating_device(_device text) TO service_role;


--
-- Name: FUNCTION claim_super_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.claim_super_admin() TO anon;
GRANT ALL ON FUNCTION public.claim_super_admin() TO authenticated;
GRANT ALL ON FUNCTION public.claim_super_admin() TO service_role;


--
-- Name: FUNCTION cleanup_generated_entity_account(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_generated_entity_account() TO anon;
GRANT ALL ON FUNCTION public.cleanup_generated_entity_account() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_generated_entity_account() TO service_role;


--
-- Name: FUNCTION clear_must_change_password(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clear_must_change_password() FROM PUBLIC;
GRANT ALL ON FUNCTION public.clear_must_change_password() TO authenticated;
GRANT ALL ON FUNCTION public.clear_must_change_password() TO service_role;


--
-- Name: FUNCTION clear_tenant_data(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clear_tenant_data(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.clear_tenant_data(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.clear_tenant_data(_id uuid) TO service_role;


--
-- Name: FUNCTION clone_tenant(_name text, _label text, _opts jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clone_tenant(_name text, _label text, _opts jsonb) TO anon;
GRANT ALL ON FUNCTION public.clone_tenant(_name text, _label text, _opts jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.clone_tenant(_name text, _label text, _opts jsonb) TO service_role;


--
-- Name: FUNCTION close_fiscal_year(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.close_fiscal_year() TO anon;
GRANT ALL ON FUNCTION public.close_fiscal_year() TO authenticated;
GRANT ALL ON FUNCTION public.close_fiscal_year() TO service_role;


--
-- Name: FUNCTION close_pos_shift(_amount numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.close_pos_shift(_amount numeric) TO anon;
GRANT ALL ON FUNCTION public.close_pos_shift(_amount numeric) TO authenticated;
GRANT ALL ON FUNCTION public.close_pos_shift(_amount numeric) TO service_role;


--
-- Name: FUNCTION close_pos_shift(_amount numeric, _at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.close_pos_shift(_amount numeric, _at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.close_pos_shift(_amount numeric, _at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.close_pos_shift(_amount numeric, _at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION company_backup_plan(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.company_backup_plan() TO anon;
GRANT ALL ON FUNCTION public.company_backup_plan() TO authenticated;
GRANT ALL ON FUNCTION public.company_backup_plan() TO service_role;


--
-- Name: FUNCTION complete_mo(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.complete_mo(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.complete_mo(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.complete_mo(_id uuid) TO service_role;


--
-- Name: FUNCTION currency_delete_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.currency_delete_guard() TO anon;
GRANT ALL ON FUNCTION public.currency_delete_guard() TO authenticated;
GRANT ALL ON FUNCTION public.currency_delete_guard() TO service_role;


--
-- Name: FUNCTION current_tenant_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_tenant_id() TO anon;
GRANT ALL ON FUNCTION public.current_tenant_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_tenant_id() TO service_role;


--
-- Name: FUNCTION decide_approval(_id uuid, _approve boolean, _note text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.decide_approval(_id uuid, _approve boolean, _note text) TO anon;
GRANT ALL ON FUNCTION public.decide_approval(_id uuid, _approve boolean, _note text) TO authenticated;
GRANT ALL ON FUNCTION public.decide_approval(_id uuid, _approve boolean, _note text) TO service_role;


--
-- Name: FUNCTION document_lines_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.document_lines_guard() TO anon;
GRANT ALL ON FUNCTION public.document_lines_guard() TO authenticated;
GRANT ALL ON FUNCTION public.document_lines_guard() TO service_role;


--
-- Name: FUNCTION document_lines_no_group(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.document_lines_no_group() TO anon;
GRANT ALL ON FUNCTION public.document_lines_no_group() TO authenticated;
GRANT ALL ON FUNCTION public.document_lines_no_group() TO service_role;


--
-- Name: FUNCTION documents_before(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.documents_before() TO anon;
GRANT ALL ON FUNCTION public.documents_before() TO authenticated;
GRANT ALL ON FUNCTION public.documents_before() TO service_role;


--
-- Name: FUNCTION emit_notification(_tenant uuid, _kind text, _title text, _body text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.emit_notification(_tenant uuid, _kind text, _title text, _body text) TO anon;
GRANT ALL ON FUNCTION public.emit_notification(_tenant uuid, _kind text, _title text, _body text) TO authenticated;
GRANT ALL ON FUNCTION public.emit_notification(_tenant uuid, _kind text, _title text, _body text) TO service_role;


--
-- Name: FUNCTION emit_notification(_tenant uuid, _kind text, _title text, _body text, _link text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.emit_notification(_tenant uuid, _kind text, _title text, _body text, _link text) TO anon;
GRANT ALL ON FUNCTION public.emit_notification(_tenant uuid, _kind text, _title text, _body text, _link text) TO authenticated;
GRANT ALL ON FUNCTION public.emit_notification(_tenant uuid, _kind text, _title text, _body text, _link text) TO service_role;


--
-- Name: FUNCTION enable_branches(_on boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enable_branches(_on boolean) TO anon;
GRANT ALL ON FUNCTION public.enable_branches(_on boolean) TO authenticated;
GRANT ALL ON FUNCTION public.enable_branches(_on boolean) TO service_role;


--
-- Name: FUNCTION enforce_primary_pattern_access(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_primary_pattern_access() TO anon;
GRANT ALL ON FUNCTION public.enforce_primary_pattern_access() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_primary_pattern_access() TO service_role;


--
-- Name: FUNCTION ensure_entity_parent_account(_table text, _id uuid, _tenant uuid, _seen uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_entity_parent_account(_table text, _id uuid, _tenant uuid, _seen uuid[]) TO anon;
GRANT ALL ON FUNCTION public.ensure_entity_parent_account(_table text, _id uuid, _tenant uuid, _seen uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_entity_parent_account(_table text, _id uuid, _tenant uuid, _seen uuid[]) TO service_role;


--
-- Name: FUNCTION ensure_opening_entry(_tenant uuid, _date date, _branch uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_opening_entry(_tenant uuid, _date date, _branch uuid) TO anon;
GRANT ALL ON FUNCTION public.ensure_opening_entry(_tenant uuid, _date date, _branch uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_opening_entry(_tenant uuid, _date date, _branch uuid) TO service_role;


--
-- Name: FUNCTION ensure_pos_drawer(_user uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_pos_drawer(_user uuid) TO anon;
GRANT ALL ON FUNCTION public.ensure_pos_drawer(_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_pos_drawer(_user uuid) TO service_role;


--
-- Name: FUNCTION entity_auto_account(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.entity_auto_account() TO anon;
GRANT ALL ON FUNCTION public.entity_auto_account() TO authenticated;
GRANT ALL ON FUNCTION public.entity_auto_account() TO service_role;


--
-- Name: FUNCTION entity_ledger_account(_tenant uuid, _parent uuid, _name text, _group boolean, _currency text, _kind text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.entity_ledger_account(_tenant uuid, _parent uuid, _name text, _group boolean, _currency text, _kind text) TO anon;
GRANT ALL ON FUNCTION public.entity_ledger_account(_tenant uuid, _parent uuid, _name text, _group boolean, _currency text, _kind text) TO authenticated;
GRANT ALL ON FUNCTION public.entity_ledger_account(_tenant uuid, _parent uuid, _name text, _group boolean, _currency text, _kind text) TO service_role;


--
-- Name: FUNCTION finalize_stocktake(_id uuid, _entries uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finalize_stocktake(_id uuid, _entries uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finalize_stocktake(_id uuid, _entries uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.finalize_stocktake(_id uuid, _entries uuid[]) TO service_role;


--
-- Name: FUNCTION fiscal_close_preview(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fiscal_close_preview() TO authenticated;
GRANT ALL ON FUNCTION public.fiscal_close_preview() TO service_role;


--
-- Name: FUNCTION fx_rate_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fx_rate_guard() TO anon;
GRANT ALL ON FUNCTION public.fx_rate_guard() TO authenticated;
GRANT ALL ON FUNCTION public.fx_rate_guard() TO service_role;


--
-- Name: FUNCTION fx_rate_log(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fx_rate_log() TO anon;
GRANT ALL ON FUNCTION public.fx_rate_log() TO authenticated;
GRANT ALL ON FUNCTION public.fx_rate_log() TO service_role;


--
-- Name: FUNCTION grant_default_permissions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.grant_default_permissions() TO anon;
GRANT ALL ON FUNCTION public.grant_default_permissions() TO authenticated;
GRANT ALL ON FUNCTION public.grant_default_permissions() TO service_role;


--
-- Name: FUNCTION guard_doc_period(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_doc_period() TO anon;
GRANT ALL ON FUNCTION public.guard_doc_period() TO authenticated;
GRANT ALL ON FUNCTION public.guard_doc_period() TO service_role;


--
-- Name: FUNCTION guard_entity_account_history(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_entity_account_history() TO anon;
GRANT ALL ON FUNCTION public.guard_entity_account_history() TO authenticated;
GRANT ALL ON FUNCTION public.guard_entity_account_history() TO service_role;


--
-- Name: FUNCTION guard_entry(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_entry() TO anon;
GRANT ALL ON FUNCTION public.guard_entry() TO authenticated;
GRANT ALL ON FUNCTION public.guard_entry() TO service_role;


--
-- Name: FUNCTION guard_linked_account_delete(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_linked_account_delete() TO anon;
GRANT ALL ON FUNCTION public.guard_linked_account_delete() TO authenticated;
GRANT ALL ON FUNCTION public.guard_linked_account_delete() TO service_role;


--
-- Name: FUNCTION guard_opening_delete(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_opening_delete() TO anon;
GRANT ALL ON FUNCTION public.guard_opening_delete() TO authenticated;
GRANT ALL ON FUNCTION public.guard_opening_delete() TO service_role;


--
-- Name: FUNCTION guard_source_lines(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_source_lines() TO anon;
GRANT ALL ON FUNCTION public.guard_source_lines() TO authenticated;
GRANT ALL ON FUNCTION public.guard_source_lines() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_perm(_module text, _action public.perm_action); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_perm(_module text, _action public.perm_action) TO anon;
GRANT ALL ON FUNCTION public.has_perm(_module text, _action public.perm_action) TO authenticated;
GRANT ALL ON FUNCTION public.has_perm(_module text, _action public.perm_action) TO service_role;


--
-- Name: FUNCTION hotel_check_in(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.hotel_check_in(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.hotel_check_in(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.hotel_check_in(_id uuid) TO service_role;


--
-- Name: FUNCTION hotel_check_out(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.hotel_check_out(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.hotel_check_out(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.hotel_check_out(_id uuid) TO service_role;


--
-- Name: FUNCTION hotel_receive_advance(_id uuid, _amount numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.hotel_receive_advance(_id uuid, _amount numeric) TO anon;
GRANT ALL ON FUNCTION public.hotel_receive_advance(_id uuid, _amount numeric) TO authenticated;
GRANT ALL ON FUNCTION public.hotel_receive_advance(_id uuid, _amount numeric) TO service_role;


--
-- Name: FUNCTION inventory_method_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.inventory_method_guard() TO anon;
GRANT ALL ON FUNCTION public.inventory_method_guard() TO authenticated;
GRANT ALL ON FUNCTION public.inventory_method_guard() TO service_role;


--
-- Name: FUNCTION is_auditor(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_auditor() TO anon;
GRANT ALL ON FUNCTION public.is_auditor() TO authenticated;
GRANT ALL ON FUNCTION public.is_auditor() TO service_role;


--
-- Name: FUNCTION is_auditor_or_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_auditor_or_admin() TO anon;
GRANT ALL ON FUNCTION public.is_auditor_or_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_auditor_or_admin() TO service_role;


--
-- Name: FUNCTION is_super_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_super_admin() TO anon;
GRANT ALL ON FUNCTION public.is_super_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_super_admin() TO service_role;


--
-- Name: FUNCTION is_tenant_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_tenant_admin() TO anon;
GRANT ALL ON FUNCTION public.is_tenant_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_tenant_admin() TO service_role;


--
-- Name: FUNCTION linked_account_currency_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.linked_account_currency_guard() TO anon;
GRANT ALL ON FUNCTION public.linked_account_currency_guard() TO authenticated;
GRANT ALL ON FUNCTION public.linked_account_currency_guard() TO service_role;


--
-- Name: FUNCTION lock_monetary_after_moves(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.lock_monetary_after_moves() TO anon;
GRANT ALL ON FUNCTION public.lock_monetary_after_moves() TO authenticated;
GRANT ALL ON FUNCTION public.lock_monetary_after_moves() TO service_role;


--
-- Name: FUNCTION mark_notifications_seen(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_notifications_seen() TO anon;
GRANT ALL ON FUNCTION public.mark_notifications_seen() TO authenticated;
GRANT ALL ON FUNCTION public.mark_notifications_seen() TO service_role;


--
-- Name: FUNCTION mo_material_cost(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mo_material_cost(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.mo_material_cost(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mo_material_cost(_id uuid) TO service_role;


--
-- Name: FUNCTION my_branch_scope(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_branch_scope() TO anon;
GRANT ALL ON FUNCTION public.my_branch_scope() TO authenticated;
GRANT ALL ON FUNCTION public.my_branch_scope() TO service_role;


--
-- Name: FUNCTION my_data_files(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_data_files() TO anon;
GRANT ALL ON FUNCTION public.my_data_files() TO authenticated;
GRANT ALL ON FUNCTION public.my_data_files() TO service_role;


--
-- Name: FUNCTION my_pos_cash(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_pos_cash() TO anon;
GRANT ALL ON FUNCTION public.my_pos_cash() TO authenticated;
GRANT ALL ON FUNCTION public.my_pos_cash() TO service_role;


--
-- Name: FUNCTION my_tenant_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_tenant_id() TO anon;
GRANT ALL ON FUNCTION public.my_tenant_id() TO authenticated;
GRANT ALL ON FUNCTION public.my_tenant_id() TO service_role;


--
-- Name: FUNCTION notes_notify(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notes_notify() TO anon;
GRANT ALL ON FUNCTION public.notes_notify() TO authenticated;
GRANT ALL ON FUNCTION public.notes_notify() TO service_role;


--
-- Name: FUNCTION notify_events(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_events() TO anon;
GRANT ALL ON FUNCTION public.notify_events() TO authenticated;
GRANT ALL ON FUNCTION public.notify_events() TO service_role;


--
-- Name: FUNCTION notify_note_reminder(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_note_reminder(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.notify_note_reminder(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.notify_note_reminder(_id uuid) TO service_role;


--
-- Name: FUNCTION notify_super_admins(_tenant uuid, _title text, _body text, _kind text, _link text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_super_admins(_tenant uuid, _title text, _body text, _kind text, _link text) TO anon;
GRANT ALL ON FUNCTION public.notify_super_admins(_tenant uuid, _title text, _body text, _kind text, _link text) TO authenticated;
GRANT ALL ON FUNCTION public.notify_super_admins(_tenant uuid, _title text, _body text, _kind text, _link text) TO service_role;


--
-- Name: FUNCTION notify_tenant_admins(_tenant uuid, _title text, _body text, _kind text, _link text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_tenant_admins(_tenant uuid, _title text, _body text, _kind text, _link text) TO anon;
GRANT ALL ON FUNCTION public.notify_tenant_admins(_tenant uuid, _title text, _body text, _kind text, _link text) TO authenticated;
GRANT ALL ON FUNCTION public.notify_tenant_admins(_tenant uuid, _title text, _body text, _kind text, _link text) TO service_role;


--
-- Name: FUNCTION notify_user(_user uuid, _tenant uuid, _title text, _body text, _kind text, _link text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_user(_user uuid, _tenant uuid, _title text, _body text, _kind text, _link text) TO anon;
GRANT ALL ON FUNCTION public.notify_user(_user uuid, _tenant uuid, _title text, _body text, _kind text, _link text) TO authenticated;
GRANT ALL ON FUNCTION public.notify_user(_user uuid, _tenant uuid, _title text, _body text, _kind text, _link text) TO service_role;


--
-- Name: FUNCTION open_pos_shift(_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.open_pos_shift(_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.open_pos_shift(_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.open_pos_shift(_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION partner_auto_account(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.partner_auto_account() TO anon;
GRANT ALL ON FUNCTION public.partner_auto_account() TO authenticated;
GRANT ALL ON FUNCTION public.partner_auto_account() TO service_role;


--
-- Name: FUNCTION partner_currency_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.partner_currency_guard() TO anon;
GRANT ALL ON FUNCTION public.partner_currency_guard() TO authenticated;
GRANT ALL ON FUNCTION public.partner_currency_guard() TO service_role;


--
-- Name: FUNCTION partner_inquiry_after(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.partner_inquiry_after() TO anon;
GRANT ALL ON FUNCTION public.partner_inquiry_after() TO authenticated;
GRANT ALL ON FUNCTION public.partner_inquiry_after() TO service_role;


--
-- Name: FUNCTION pos_document_cash(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pos_document_cash() TO anon;
GRANT ALL ON FUNCTION public.pos_document_cash() TO authenticated;
GRANT ALL ON FUNCTION public.pos_document_cash() TO service_role;


--
-- Name: FUNCTION post_assembly(_mode text, _warehouse uuid, _date date, _product uuid, _qty numeric, _components jsonb, _notes text, _to_warehouse uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.post_assembly(_mode text, _warehouse uuid, _date date, _product uuid, _qty numeric, _components jsonb, _notes text, _to_warehouse uuid) TO anon;
GRANT ALL ON FUNCTION public.post_assembly(_mode text, _warehouse uuid, _date date, _product uuid, _qty numeric, _components jsonb, _notes text, _to_warehouse uuid) TO authenticated;
GRANT ALL ON FUNCTION public.post_assembly(_mode text, _warehouse uuid, _date date, _product uuid, _qty numeric, _components jsonb, _notes text, _to_warehouse uuid) TO service_role;


--
-- Name: FUNCTION post_cost_document(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.post_cost_document(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.post_cost_document(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.post_cost_document(_id uuid) TO service_role;


--
-- Name: FUNCTION post_doc_charges(_t uuid, _e uuid, _ch jsonb, _sale boolean, _disc_acc uuid, _add_acc uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.post_doc_charges(_t uuid, _e uuid, _ch jsonb, _sale boolean, _disc_acc uuid, _add_acc uuid) TO anon;
GRANT ALL ON FUNCTION public.post_doc_charges(_t uuid, _e uuid, _ch jsonb, _sale boolean, _disc_acc uuid, _add_acc uuid) TO authenticated;
GRANT ALL ON FUNCTION public.post_doc_charges(_t uuid, _e uuid, _ch jsonb, _sale boolean, _disc_acc uuid, _add_acc uuid) TO service_role;


--
-- Name: FUNCTION post_document(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.post_document(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.post_document(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.post_document(_id uuid) TO service_role;


--
-- Name: FUNCTION post_document_core(_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.post_document_core(_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.post_document_core(_id uuid) TO service_role;


--
-- Name: FUNCTION products_apply_price_rules(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.products_apply_price_rules() TO anon;
GRANT ALL ON FUNCTION public.products_apply_price_rules() TO authenticated;
GRANT ALL ON FUNCTION public.products_apply_price_rules() TO service_role;


--
-- Name: FUNCTION products_category_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.products_category_guard() TO anon;
GRANT ALL ON FUNCTION public.products_category_guard() TO authenticated;
GRANT ALL ON FUNCTION public.products_category_guard() TO service_role;


--
-- Name: FUNCTION products_item_type_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.products_item_type_guard() TO anon;
GRANT ALL ON FUNCTION public.products_item_type_guard() TO authenticated;
GRANT ALL ON FUNCTION public.products_item_type_guard() TO service_role;


--
-- Name: FUNCTION products_service_links(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.products_service_links() TO anon;
GRANT ALL ON FUNCTION public.products_service_links() TO authenticated;
GRANT ALL ON FUNCTION public.products_service_links() TO service_role;


--
-- Name: FUNCTION profile_self_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.profile_self_guard() TO anon;
GRANT ALL ON FUNCTION public.profile_self_guard() TO authenticated;
GRANT ALL ON FUNCTION public.profile_self_guard() TO service_role;


--
-- Name: FUNCTION project_section_ok(_section text, _action public.perm_action); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.project_section_ok(_section text, _action public.perm_action) TO anon;
GRANT ALL ON FUNCTION public.project_section_ok(_section text, _action public.perm_action) TO authenticated;
GRANT ALL ON FUNCTION public.project_section_ok(_section text, _action public.perm_action) TO service_role;


--
-- Name: FUNCTION project_wbs_rollup(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.project_wbs_rollup() TO anon;
GRANT ALL ON FUNCTION public.project_wbs_rollup() TO authenticated;
GRANT ALL ON FUNCTION public.project_wbs_rollup() TO service_role;


--
-- Name: FUNCTION provision_pos_drawer(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.provision_pos_drawer() TO anon;
GRANT ALL ON FUNCTION public.provision_pos_drawer() TO authenticated;
GRANT ALL ON FUNCTION public.provision_pos_drawer() TO service_role;


--
-- Name: FUNCTION purge_attachments_on_clear(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.purge_attachments_on_clear() TO anon;
GRANT ALL ON FUNCTION public.purge_attachments_on_clear() TO authenticated;
GRANT ALL ON FUNCTION public.purge_attachments_on_clear() TO service_role;


--
-- Name: FUNCTION purge_tenant(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.purge_tenant(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.purge_tenant(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.purge_tenant(_id uuid) TO service_role;


--
-- Name: FUNCTION recalc_wbs_progress(_project uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recalc_wbs_progress(_project uuid) TO anon;
GRANT ALL ON FUNCTION public.recalc_wbs_progress(_project uuid) TO authenticated;
GRANT ALL ON FUNCTION public.recalc_wbs_progress(_project uuid) TO service_role;


--
-- Name: FUNCTION receive_transfer(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.receive_transfer(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.receive_transfer(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.receive_transfer(_id uuid) TO service_role;


--
-- Name: FUNCTION recipe_consume_on_sale(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recipe_consume_on_sale() TO anon;
GRANT ALL ON FUNCTION public.recipe_consume_on_sale() TO authenticated;
GRANT ALL ON FUNCTION public.recipe_consume_on_sale() TO service_role;


--
-- Name: FUNCTION record_comment_after(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.record_comment_after() TO anon;
GRANT ALL ON FUNCTION public.record_comment_after() TO authenticated;
GRANT ALL ON FUNCTION public.record_comment_after() TO service_role;


--
-- Name: FUNCTION reopen_fiscal_period(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reopen_fiscal_period() TO anon;
GRANT ALL ON FUNCTION public.reopen_fiscal_period() TO authenticated;
GRANT ALL ON FUNCTION public.reopen_fiscal_period() TO service_role;


--
-- Name: FUNCTION restore_company_begin(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.restore_company_begin(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.restore_company_begin(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.restore_company_begin(_id uuid) TO service_role;


--
-- Name: FUNCTION restore_company_finish(_id uuid, _settings jsonb, _tenant jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.restore_company_finish(_id uuid, _settings jsonb, _tenant jsonb) TO anon;
GRANT ALL ON FUNCTION public.restore_company_finish(_id uuid, _settings jsonb, _tenant jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.restore_company_finish(_id uuid, _settings jsonb, _tenant jsonb) TO service_role;


--
-- Name: FUNCTION restore_company_rows(_id uuid, _table text, _rows jsonb, _phase text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.restore_company_rows(_id uuid, _table text, _rows jsonb, _phase text) TO anon;
GRANT ALL ON FUNCTION public.restore_company_rows(_id uuid, _table text, _rows jsonb, _phase text) TO authenticated;
GRANT ALL ON FUNCTION public.restore_company_rows(_id uuid, _table text, _rows jsonb, _phase text) TO service_role;


--
-- Name: FUNCTION restore_tenant(_id uuid, _data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.restore_tenant(_id uuid, _data jsonb) TO anon;
GRANT ALL ON FUNCTION public.restore_tenant(_id uuid, _data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.restore_tenant(_id uuid, _data jsonb) TO service_role;


--
-- Name: FUNCTION restore_tenant_full(_id uuid, _data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.restore_tenant_full(_id uuid, _data jsonb) TO anon;
GRANT ALL ON FUNCTION public.restore_tenant_full(_id uuid, _data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.restore_tenant_full(_id uuid, _data jsonb) TO service_role;


--
-- Name: FUNCTION revalue_fx_balances(_date date, _rates jsonb, _post boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.revalue_fx_balances(_date date, _rates jsonb, _post boolean) TO anon;
GRANT ALL ON FUNCTION public.revalue_fx_balances(_date date, _rates jsonb, _post boolean) TO authenticated;
GRANT ALL ON FUNCTION public.revalue_fx_balances(_date date, _rates jsonb, _post boolean) TO service_role;


--
-- Name: FUNCTION revert_stock_move(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.revert_stock_move() TO anon;
GRANT ALL ON FUNCTION public.revert_stock_move() TO authenticated;
GRANT ALL ON FUNCTION public.revert_stock_move() TO service_role;


--
-- Name: FUNCTION save_opening_entry(_date date, _lines jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.save_opening_entry(_date date, _lines jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_opening_entry(_date date, _lines jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_opening_entry(_date date, _lines jsonb) TO service_role;


--
-- Name: FUNCTION service_order_quota(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.service_order_quota() TO anon;
GRANT ALL ON FUNCTION public.service_order_quota() TO authenticated;
GRANT ALL ON FUNCTION public.service_order_quota() TO service_role;


--
-- Name: FUNCTION service_order_sla(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.service_order_sla() TO anon;
GRANT ALL ON FUNCTION public.service_order_sla() TO authenticated;
GRANT ALL ON FUNCTION public.service_order_sla() TO service_role;


--
-- Name: FUNCTION service_orders_from_sale(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.service_orders_from_sale() TO anon;
GRANT ALL ON FUNCTION public.service_orders_from_sale() TO authenticated;
GRANT ALL ON FUNCTION public.service_orders_from_sale() TO service_role;


--
-- Name: FUNCTION set_active_branch(_b uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_active_branch(_b uuid) TO anon;
GRANT ALL ON FUNCTION public.set_active_branch(_b uuid) TO authenticated;
GRANT ALL ON FUNCTION public.set_active_branch(_b uuid) TO service_role;


--
-- Name: FUNCTION set_bound_device_info(_device text, _info jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_bound_device_info(_device text, _info jsonb) TO anon;
GRANT ALL ON FUNCTION public.set_bound_device_info(_device text, _info jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.set_bound_device_info(_device text, _info jsonb) TO service_role;


--
-- Name: FUNCTION set_entry_audited(_id uuid, _ok boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_entry_audited(_id uuid, _ok boolean) TO anon;
GRANT ALL ON FUNCTION public.set_entry_audited(_id uuid, _ok boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_entry_audited(_id uuid, _ok boolean) TO service_role;


--
-- Name: FUNCTION set_entry_no(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_entry_no() TO anon;
GRANT ALL ON FUNCTION public.set_entry_no() TO authenticated;
GRANT ALL ON FUNCTION public.set_entry_no() TO service_role;


--
-- Name: FUNCTION set_mo_no(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_mo_no() TO anon;
GRANT ALL ON FUNCTION public.set_mo_no() TO authenticated;
GRANT ALL ON FUNCTION public.set_mo_no() TO service_role;


--
-- Name: FUNCTION set_mo_stage(_id uuid, _stage text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_mo_stage(_id uuid, _stage text) TO anon;
GRANT ALL ON FUNCTION public.set_mo_stage(_id uuid, _stage text) TO authenticated;
GRANT ALL ON FUNCTION public.set_mo_stage(_id uuid, _stage text) TO service_role;


--
-- Name: FUNCTION set_operating_mode(_mode text, _device text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_operating_mode(_mode text, _device text) TO anon;
GRANT ALL ON FUNCTION public.set_operating_mode(_mode text, _device text) TO authenticated;
GRANT ALL ON FUNCTION public.set_operating_mode(_mode text, _device text) TO service_role;


--
-- Name: FUNCTION set_tenant_branding(_logo text, _color text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_tenant_branding(_logo text, _color text) TO anon;
GRANT ALL ON FUNCTION public.set_tenant_branding(_logo text, _color text) TO authenticated;
GRANT ALL ON FUNCTION public.set_tenant_branding(_logo text, _color text) TO service_role;


--
-- Name: FUNCTION set_tenant_theme(_logo text, _colors jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_tenant_theme(_logo text, _colors jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.set_tenant_theme(_logo text, _colors jsonb) TO service_role;


--
-- Name: FUNCTION set_tenant_white_label(_on boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_tenant_white_label(_on boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_tenant_white_label(_on boolean) TO service_role;


--
-- Name: FUNCTION solar_section_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.solar_section_guard() TO anon;
GRANT ALL ON FUNCTION public.solar_section_guard() TO authenticated;
GRANT ALL ON FUNCTION public.solar_section_guard() TO service_role;


--
-- Name: FUNCTION stock_moves_no_group_wh(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.stock_moves_no_group_wh() TO anon;
GRANT ALL ON FUNCTION public.stock_moves_no_group_wh() TO authenticated;
GRANT ALL ON FUNCTION public.stock_moves_no_group_wh() TO service_role;


--
-- Name: FUNCTION support_message_after(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.support_message_after() TO anon;
GRANT ALL ON FUNCTION public.support_message_after() TO authenticated;
GRANT ALL ON FUNCTION public.support_message_after() TO service_role;


--
-- Name: FUNCTION switch_tenant(_t uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.switch_tenant(_t uuid) TO anon;
GRANT ALL ON FUNCTION public.switch_tenant(_t uuid) TO authenticated;
GRANT ALL ON FUNCTION public.switch_tenant(_t uuid) TO service_role;


--
-- Name: FUNCTION sync_entity_account(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_entity_account() TO anon;
GRANT ALL ON FUNCTION public.sync_entity_account() TO authenticated;
GRANT ALL ON FUNCTION public.sync_entity_account() TO service_role;


--
-- Name: FUNCTION sync_tenant_member(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_tenant_member() TO anon;
GRANT ALL ON FUNCTION public.sync_tenant_member() TO authenticated;
GRANT ALL ON FUNCTION public.sync_tenant_member() TO service_role;


--
-- Name: FUNCTION telegram_auto_add_station(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.telegram_auto_add_station() TO anon;
GRANT ALL ON FUNCTION public.telegram_auto_add_station() TO authenticated;
GRANT ALL ON FUNCTION public.telegram_auto_add_station() TO service_role;


--
-- Name: FUNCTION tenant_active(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tenant_active() TO anon;
GRANT ALL ON FUNCTION public.tenant_active() TO authenticated;
GRANT ALL ON FUNCTION public.tenant_active() TO service_role;


--
-- Name: FUNCTION tenant_colleagues(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tenant_colleagues() TO anon;
GRANT ALL ON FUNCTION public.tenant_colleagues() TO authenticated;
GRANT ALL ON FUNCTION public.tenant_colleagues() TO service_role;


--
-- Name: FUNCTION undo_audit(_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.undo_audit(_id bigint) TO anon;
GRANT ALL ON FUNCTION public.undo_audit(_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.undo_audit(_id bigint) TO service_role;


--
-- Name: FUNCTION unpost_document(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unpost_document(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.unpost_document(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.unpost_document(_id uuid) TO service_role;


--
-- Name: FUNCTION update_company_info(_name text, _code text, _phone text, _address text, _notes text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_company_info(_name text, _code text, _phone text, _address text, _notes text) TO anon;
GRANT ALL ON FUNCTION public.update_company_info(_name text, _code text, _phone text, _address text, _notes text) TO authenticated;
GRANT ALL ON FUNCTION public.update_company_info(_name text, _code text, _phone text, _address text, _notes text) TO service_role;


--
-- Name: FUNCTION update_my_profile(_full_name text, _phone text, _avatar_url text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_my_profile(_full_name text, _phone text, _avatar_url text) TO anon;
GRANT ALL ON FUNCTION public.update_my_profile(_full_name text, _phone text, _avatar_url text) TO authenticated;
GRANT ALL ON FUNCTION public.update_my_profile(_full_name text, _phone text, _avatar_url text) TO service_role;


--
-- Name: FUNCTION validate_closing_account_links(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_closing_account_links() TO anon;
GRANT ALL ON FUNCTION public.validate_closing_account_links() TO authenticated;
GRANT ALL ON FUNCTION public.validate_closing_account_links() TO service_role;


--
-- Name: FUNCTION validate_initial_quantity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_initial_quantity() TO anon;
GRANT ALL ON FUNCTION public.validate_initial_quantity() TO authenticated;
GRANT ALL ON FUNCTION public.validate_initial_quantity() TO service_role;


--
-- Name: FUNCTION warehouses_tree_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.warehouses_tree_guard() TO anon;
GRANT ALL ON FUNCTION public.warehouses_tree_guard() TO authenticated;
GRANT ALL ON FUNCTION public.warehouses_tree_guard() TO service_role;


--
-- Name: TABLE _probe; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._probe TO anon;
GRANT ALL ON TABLE public._probe TO authenticated;
GRANT ALL ON TABLE public._probe TO service_role;


--
-- Name: TABLE _restore_req; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._restore_req TO anon;
GRANT ALL ON TABLE public._restore_req TO authenticated;
GRANT ALL ON TABLE public._restore_req TO service_role;


--
-- Name: TABLE _stg_auth_identities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._stg_auth_identities TO anon;
GRANT ALL ON TABLE public._stg_auth_identities TO authenticated;
GRANT ALL ON TABLE public._stg_auth_identities TO service_role;


--
-- Name: TABLE _stg_auth_users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._stg_auth_users TO anon;
GRANT ALL ON TABLE public._stg_auth_users TO authenticated;
GRANT ALL ON TABLE public._stg_auth_users TO service_role;


--
-- Name: TABLE accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.accounts TO anon;
GRANT ALL ON TABLE public.accounts TO authenticated;
GRANT ALL ON TABLE public.accounts TO service_role;


--
-- Name: TABLE ai_drafts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_drafts TO anon;
GRANT ALL ON TABLE public.ai_drafts TO authenticated;
GRANT ALL ON TABLE public.ai_drafts TO service_role;


--
-- Name: TABLE ai_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_messages TO anon;
GRANT ALL ON TABLE public.ai_messages TO authenticated;
GRANT ALL ON TABLE public.ai_messages TO service_role;


--
-- Name: TABLE ai_threads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_threads TO anon;
GRANT ALL ON TABLE public.ai_threads TO authenticated;
GRANT ALL ON TABLE public.ai_threads TO service_role;


--
-- Name: TABLE app_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_config TO anon;
GRANT ALL ON TABLE public.app_config TO authenticated;
GRANT ALL ON TABLE public.app_config TO service_role;


--
-- Name: TABLE approval_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.approval_requests TO anon;
GRANT ALL ON TABLE public.approval_requests TO authenticated;
GRANT ALL ON TABLE public.approval_requests TO service_role;


--
-- Name: TABLE assembly_vouchers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.assembly_vouchers TO anon;
GRANT ALL ON TABLE public.assembly_vouchers TO authenticated;
GRANT ALL ON TABLE public.assembly_vouchers TO service_role;


--
-- Name: TABLE attachments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.attachments TO anon;
GRANT ALL ON TABLE public.attachments TO authenticated;
GRANT ALL ON TABLE public.attachments TO service_role;


--
-- Name: TABLE audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_log TO anon;
GRANT ALL ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;


--
-- Name: SEQUENCE audit_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.audit_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.audit_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.audit_log_id_seq TO service_role;


--
-- Name: TABLE backups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.backups TO anon;
GRANT ALL ON TABLE public.backups TO authenticated;
GRANT ALL ON TABLE public.backups TO service_role;


--
-- Name: TABLE bank_recon_marks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bank_recon_marks TO anon;
GRANT ALL ON TABLE public.bank_recon_marks TO authenticated;
GRANT ALL ON TABLE public.bank_recon_marks TO service_role;


--
-- Name: TABLE banks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.banks TO anon;
GRANT ALL ON TABLE public.banks TO authenticated;
GRANT ALL ON TABLE public.banks TO service_role;


--
-- Name: TABLE batch_consumptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.batch_consumptions TO anon;
GRANT ALL ON TABLE public.batch_consumptions TO authenticated;
GRANT ALL ON TABLE public.batch_consumptions TO service_role;


--
-- Name: TABLE boq_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.boq_items TO anon;
GRANT ALL ON TABLE public.boq_items TO authenticated;
GRANT ALL ON TABLE public.boq_items TO service_role;


--
-- Name: TABLE branches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.branches TO anon;
GRANT ALL ON TABLE public.branches TO authenticated;
GRANT ALL ON TABLE public.branches TO service_role;


--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_messages TO anon;
GRANT ALL ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;


--
-- Name: TABLE cheques; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cheques TO anon;
GRANT ALL ON TABLE public.cheques TO authenticated;
GRANT ALL ON TABLE public.cheques TO service_role;


--
-- Name: TABLE cost_centers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cost_centers TO anon;
GRANT ALL ON TABLE public.cost_centers TO authenticated;
GRANT ALL ON TABLE public.cost_centers TO service_role;


--
-- Name: TABLE currencies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.currencies TO anon;
GRANT ALL ON TABLE public.currencies TO authenticated;
GRANT ALL ON TABLE public.currencies TO service_role;


--
-- Name: TABLE doc_patterns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.doc_patterns TO anon;
GRANT ALL ON TABLE public.doc_patterns TO authenticated;
GRANT ALL ON TABLE public.doc_patterns TO service_role;


--
-- Name: TABLE document_lines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.document_lines TO anon;
GRANT ALL ON TABLE public.document_lines TO authenticated;
GRANT ALL ON TABLE public.document_lines TO service_role;


--
-- Name: TABLE documents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.documents TO anon;
GRANT ALL ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.documents TO service_role;


--
-- Name: TABLE employee_adjustments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employee_adjustments TO anon;
GRANT ALL ON TABLE public.employee_adjustments TO authenticated;
GRANT ALL ON TABLE public.employee_adjustments TO service_role;


--
-- Name: TABLE employee_advances; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employee_advances TO anon;
GRANT ALL ON TABLE public.employee_advances TO authenticated;
GRANT ALL ON TABLE public.employee_advances TO service_role;


--
-- Name: TABLE employee_leaves; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employee_leaves TO anon;
GRANT ALL ON TABLE public.employee_leaves TO authenticated;
GRANT ALL ON TABLE public.employee_leaves TO service_role;


--
-- Name: TABLE employees; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employees TO anon;
GRANT ALL ON TABLE public.employees TO authenticated;
GRANT ALL ON TABLE public.employees TO service_role;


--
-- Name: TABLE exchange_rates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.exchange_rates TO anon;
GRANT ALL ON TABLE public.exchange_rates TO authenticated;
GRANT ALL ON TABLE public.exchange_rates TO service_role;


--
-- Name: TABLE fixed_assets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fixed_assets TO anon;
GRANT ALL ON TABLE public.fixed_assets TO authenticated;
GRANT ALL ON TABLE public.fixed_assets TO service_role;


--
-- Name: TABLE fx_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fx_log TO anon;
GRANT ALL ON TABLE public.fx_log TO authenticated;
GRANT ALL ON TABLE public.fx_log TO service_role;


--
-- Name: TABLE hotel_reservations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hotel_reservations TO anon;
GRANT ALL ON TABLE public.hotel_reservations TO authenticated;
GRANT ALL ON TABLE public.hotel_reservations TO service_role;


--
-- Name: TABLE hotel_rooms; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hotel_rooms TO anon;
GRANT ALL ON TABLE public.hotel_rooms TO authenticated;
GRANT ALL ON TABLE public.hotel_rooms TO service_role;


--
-- Name: TABLE journal_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.journal_entries TO anon;
GRANT ALL ON TABLE public.journal_entries TO authenticated;
GRANT ALL ON TABLE public.journal_entries TO service_role;


--
-- Name: TABLE journal_lines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.journal_lines TO anon;
GRANT ALL ON TABLE public.journal_lines TO authenticated;
GRANT ALL ON TABLE public.journal_lines TO service_role;


--
-- Name: TABLE login_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.login_events TO anon;
GRANT ALL ON TABLE public.login_events TO authenticated;
GRANT ALL ON TABLE public.login_events TO service_role;


--
-- Name: TABLE manufacturing_byproducts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.manufacturing_byproducts TO anon;
GRANT ALL ON TABLE public.manufacturing_byproducts TO authenticated;
GRANT ALL ON TABLE public.manufacturing_byproducts TO service_role;


--
-- Name: TABLE manufacturing_materials; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.manufacturing_materials TO anon;
GRANT ALL ON TABLE public.manufacturing_materials TO authenticated;
GRANT ALL ON TABLE public.manufacturing_materials TO service_role;


--
-- Name: TABLE manufacturing_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.manufacturing_orders TO anon;
GRANT ALL ON TABLE public.manufacturing_orders TO authenticated;
GRANT ALL ON TABLE public.manufacturing_orders TO service_role;


--
-- Name: TABLE notification_reads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_reads TO anon;
GRANT ALL ON TABLE public.notification_reads TO authenticated;
GRANT ALL ON TABLE public.notification_reads TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE owner_finance_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.owner_finance_entries TO anon;
GRANT ALL ON TABLE public.owner_finance_entries TO authenticated;
GRANT ALL ON TABLE public.owner_finance_entries TO service_role;


--
-- Name: TABLE partner_inquiries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.partner_inquiries TO anon;
GRANT ALL ON TABLE public.partner_inquiries TO authenticated;
GRANT ALL ON TABLE public.partner_inquiries TO service_role;


--
-- Name: TABLE partners; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.partners TO anon;
GRANT ALL ON TABLE public.partners TO authenticated;
GRANT ALL ON TABLE public.partners TO service_role;


--
-- Name: TABLE payroll_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payroll_runs TO anon;
GRANT ALL ON TABLE public.payroll_runs TO authenticated;
GRANT ALL ON TABLE public.payroll_runs TO service_role;


--
-- Name: TABLE personal_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.personal_notes TO anon;
GRANT ALL ON TABLE public.personal_notes TO authenticated;
GRANT ALL ON TABLE public.personal_notes TO service_role;


--
-- Name: TABLE pos_shifts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pos_shifts TO anon;
GRANT ALL ON TABLE public.pos_shifts TO authenticated;
GRANT ALL ON TABLE public.pos_shifts TO service_role;


--
-- Name: TABLE pos_stations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pos_stations TO anon;
GRANT ALL ON TABLE public.pos_stations TO authenticated;
GRANT ALL ON TABLE public.pos_stations TO service_role;


--
-- Name: TABLE product_batches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_batches TO anon;
GRANT ALL ON TABLE public.product_batches TO authenticated;
GRANT ALL ON TABLE public.product_batches TO service_role;


--
-- Name: TABLE product_recipes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_recipes TO anon;
GRANT ALL ON TABLE public.product_recipes TO authenticated;
GRANT ALL ON TABLE public.product_recipes TO service_role;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE project_bom; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_bom TO anon;
GRANT ALL ON TABLE public.project_bom TO authenticated;
GRANT ALL ON TABLE public.project_bom TO service_role;


--
-- Name: TABLE project_expenses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_expenses TO anon;
GRANT ALL ON TABLE public.project_expenses TO authenticated;
GRANT ALL ON TABLE public.project_expenses TO service_role;


--
-- Name: TABLE project_milestones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_milestones TO anon;
GRANT ALL ON TABLE public.project_milestones TO authenticated;
GRANT ALL ON TABLE public.project_milestones TO service_role;


--
-- Name: TABLE project_quotes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_quotes TO anon;
GRANT ALL ON TABLE public.project_quotes TO authenticated;
GRANT ALL ON TABLE public.project_quotes TO service_role;


--
-- Name: TABLE project_snags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_snags TO anon;
GRANT ALL ON TABLE public.project_snags TO authenticated;
GRANT ALL ON TABLE public.project_snags TO service_role;


--
-- Name: TABLE project_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_templates TO anon;
GRANT ALL ON TABLE public.project_templates TO authenticated;
GRANT ALL ON TABLE public.project_templates TO service_role;


--
-- Name: TABLE project_wbs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_wbs TO anon;
GRANT ALL ON TABLE public.project_wbs TO authenticated;
GRANT ALL ON TABLE public.project_wbs TO service_role;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.projects TO anon;
GRANT ALL ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- Name: TABLE record_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.record_comments TO anon;
GRANT ALL ON TABLE public.record_comments TO authenticated;
GRANT ALL ON TABLE public.record_comments TO service_role;


--
-- Name: TABLE recurring_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recurring_entries TO anon;
GRANT ALL ON TABLE public.recurring_entries TO authenticated;
GRANT ALL ON TABLE public.recurring_entries TO service_role;


--
-- Name: TABLE restored_user_passwords; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.restored_user_passwords TO anon;
GRANT ALL ON TABLE public.restored_user_passwords TO authenticated;
GRANT ALL ON TABLE public.restored_user_passwords TO service_role;


--
-- Name: TABLE service_contracts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_contracts TO anon;
GRANT ALL ON TABLE public.service_contracts TO authenticated;
GRANT ALL ON TABLE public.service_contracts TO service_role;


--
-- Name: TABLE service_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_orders TO anon;
GRANT ALL ON TABLE public.service_orders TO authenticated;
GRANT ALL ON TABLE public.service_orders TO service_role;


--
-- Name: TABLE share_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.share_links TO anon;
GRANT ALL ON TABLE public.share_links TO authenticated;
GRANT ALL ON TABLE public.share_links TO service_role;


--
-- Name: TABLE shared_drafts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_drafts TO anon;
GRANT ALL ON TABLE public.shared_drafts TO authenticated;
GRANT ALL ON TABLE public.shared_drafts TO service_role;


--
-- Name: TABLE solar_ai_access; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.solar_ai_access TO anon;
GRANT ALL ON TABLE public.solar_ai_access TO authenticated;
GRANT ALL ON TABLE public.solar_ai_access TO service_role;


--
-- Name: TABLE solar_fault_analyses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.solar_fault_analyses TO anon;
GRANT ALL ON TABLE public.solar_fault_analyses TO authenticated;
GRANT ALL ON TABLE public.solar_fault_analyses TO service_role;


--
-- Name: TABLE solar_fleet_stations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.solar_fleet_stations TO anon;
GRANT ALL ON TABLE public.solar_fleet_stations TO authenticated;
GRANT ALL ON TABLE public.solar_fleet_stations TO service_role;


--
-- Name: TABLE solar_monitoring; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.solar_monitoring TO anon;
GRANT ALL ON TABLE public.solar_monitoring TO authenticated;
GRANT ALL ON TABLE public.solar_monitoring TO service_role;


--
-- Name: TABLE solar_performance_flags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.solar_performance_flags TO anon;
GRANT ALL ON TABLE public.solar_performance_flags TO authenticated;
GRANT ALL ON TABLE public.solar_performance_flags TO service_role;


--
-- Name: TABLE solar_projects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.solar_projects TO anon;
GRANT ALL ON TABLE public.solar_projects TO authenticated;
GRANT ALL ON TABLE public.solar_projects TO service_role;


--
-- Name: TABLE solar_provider_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.solar_provider_accounts TO anon;
GRANT ALL ON TABLE public.solar_provider_accounts TO authenticated;
GRANT ALL ON TABLE public.solar_provider_accounts TO service_role;


--
-- Name: TABLE solar_readings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.solar_readings TO anon;
GRANT ALL ON TABLE public.solar_readings TO authenticated;
GRANT ALL ON TABLE public.solar_readings TO service_role;


--
-- Name: TABLE solar_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.solar_roles TO anon;
GRANT ALL ON TABLE public.solar_roles TO authenticated;
GRANT ALL ON TABLE public.solar_roles TO service_role;


--
-- Name: TABLE stock_moves; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stock_moves TO anon;
GRANT ALL ON TABLE public.stock_moves TO authenticated;
GRANT ALL ON TABLE public.stock_moves TO service_role;


--
-- Name: TABLE subscription_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscription_history TO anon;
GRANT ALL ON TABLE public.subscription_history TO authenticated;
GRANT ALL ON TABLE public.subscription_history TO service_role;


--
-- Name: TABLE support_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.support_messages TO anon;
GRANT ALL ON TABLE public.support_messages TO authenticated;
GRANT ALL ON TABLE public.support_messages TO service_role;


--
-- Name: TABLE support_tickets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.support_tickets TO anon;
GRANT ALL ON TABLE public.support_tickets TO authenticated;
GRANT ALL ON TABLE public.support_tickets TO service_role;


--
-- Name: TABLE system_branding; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.system_branding TO anon;
GRANT ALL ON TABLE public.system_branding TO authenticated;
GRANT ALL ON TABLE public.system_branding TO service_role;


--
-- Name: TABLE telegram_client_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.telegram_client_links TO anon;
GRANT ALL ON TABLE public.telegram_client_links TO authenticated;
GRANT ALL ON TABLE public.telegram_client_links TO service_role;


--
-- Name: COLUMN telegram_client_links.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.telegram_client_links TO authenticated;


--
-- Name: COLUMN telegram_client_links.tenant_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(tenant_id) ON TABLE public.telegram_client_links TO authenticated;


--
-- Name: COLUMN telegram_client_links.project_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(project_id) ON TABLE public.telegram_client_links TO authenticated;


--
-- Name: COLUMN telegram_client_links.chat_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(chat_id) ON TABLE public.telegram_client_links TO authenticated;


--
-- Name: COLUMN telegram_client_links.telegram_user_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(telegram_user_id) ON TABLE public.telegram_client_links TO authenticated;


--
-- Name: COLUMN telegram_client_links.display_name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(display_name) ON TABLE public.telegram_client_links TO authenticated;


--
-- Name: COLUMN telegram_client_links.active; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(active),UPDATE(active) ON TABLE public.telegram_client_links TO authenticated;


--
-- Name: COLUMN telegram_client_links.alerts_enabled; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(alerts_enabled),UPDATE(alerts_enabled) ON TABLE public.telegram_client_links TO authenticated;


--
-- Name: COLUMN telegram_client_links.linked_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(linked_at) ON TABLE public.telegram_client_links TO authenticated;


--
-- Name: COLUMN telegram_client_links.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.telegram_client_links TO authenticated;


--
-- Name: COLUMN telegram_client_links.failed_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(failed_attempts) ON TABLE public.telegram_client_links TO authenticated;


--
-- Name: TABLE telegram_deliveries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.telegram_deliveries TO anon;
GRANT ALL ON TABLE public.telegram_deliveries TO authenticated;
GRANT ALL ON TABLE public.telegram_deliveries TO service_role;


--
-- Name: TABLE telegram_join_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.telegram_join_sessions TO anon;
GRANT ALL ON TABLE public.telegram_join_sessions TO authenticated;
GRANT ALL ON TABLE public.telegram_join_sessions TO service_role;


--
-- Name: TABLE telegram_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.telegram_links TO anon;
GRANT ALL ON TABLE public.telegram_links TO authenticated;
GRANT ALL ON TABLE public.telegram_links TO service_role;


--
-- Name: TABLE telegram_member_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.telegram_member_events TO anon;
GRANT ALL ON TABLE public.telegram_member_events TO authenticated;
GRANT ALL ON TABLE public.telegram_member_events TO service_role;


--
-- Name: TABLE telegram_team_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.telegram_team_members TO anon;
GRANT ALL ON TABLE public.telegram_team_members TO authenticated;
GRANT ALL ON TABLE public.telegram_team_members TO service_role;


--
-- Name: TABLE telegram_team_projects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.telegram_team_projects TO anon;
GRANT ALL ON TABLE public.telegram_team_projects TO authenticated;
GRANT ALL ON TABLE public.telegram_team_projects TO service_role;


--
-- Name: TABLE telegram_teams; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.telegram_teams TO anon;
GRANT ALL ON TABLE public.telegram_teams TO authenticated;
GRANT ALL ON TABLE public.telegram_teams TO service_role;


--
-- Name: TABLE telegram_updates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.telegram_updates TO anon;
GRANT ALL ON TABLE public.telegram_updates TO authenticated;
GRANT ALL ON TABLE public.telegram_updates TO service_role;


--
-- Name: TABLE tenant_features; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tenant_features TO anon;
GRANT ALL ON TABLE public.tenant_features TO authenticated;
GRANT ALL ON TABLE public.tenant_features TO service_role;


--
-- Name: TABLE tenant_integrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tenant_integrations TO anon;
GRANT ALL ON TABLE public.tenant_integrations TO authenticated;
GRANT ALL ON TABLE public.tenant_integrations TO service_role;


--
-- Name: TABLE tenant_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tenant_members TO anon;
GRANT ALL ON TABLE public.tenant_members TO authenticated;
GRANT ALL ON TABLE public.tenant_members TO service_role;


--
-- Name: TABLE tenant_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tenant_payments TO anon;
GRANT ALL ON TABLE public.tenant_payments TO authenticated;
GRANT ALL ON TABLE public.tenant_payments TO service_role;


--
-- Name: TABLE tenant_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tenant_settings TO anon;
GRANT ALL ON TABLE public.tenant_settings TO authenticated;
GRANT ALL ON TABLE public.tenant_settings TO service_role;


--
-- Name: TABLE tenants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tenants TO anon;
GRANT ALL ON TABLE public.tenants TO authenticated;
GRANT ALL ON TABLE public.tenants TO service_role;


--
-- Name: TABLE units; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.units TO anon;
GRANT ALL ON TABLE public.units TO authenticated;
GRANT ALL ON TABLE public.units TO service_role;


--
-- Name: TABLE user_cash_drawers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_cash_drawers TO anon;
GRANT ALL ON TABLE public.user_cash_drawers TO authenticated;
GRANT ALL ON TABLE public.user_cash_drawers TO service_role;


--
-- Name: TABLE user_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_permissions TO anon;
GRANT ALL ON TABLE public.user_permissions TO authenticated;
GRANT ALL ON TABLE public.user_permissions TO service_role;


--
-- Name: TABLE user_prefs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_prefs TO anon;
GRANT ALL ON TABLE public.user_prefs TO authenticated;
GRANT ALL ON TABLE public.user_prefs TO service_role;


--
-- Name: TABLE warehouses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warehouses TO anon;
GRANT ALL ON TABLE public.warehouses TO authenticated;
GRANT ALL ON TABLE public.warehouses TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--



-- ===== مشغلات المصادقة والتخزين =====
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE POLICY "tenant files read" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = ANY (ARRAY['attachments'::text, 'backups'::text])) AND ((storage.foldername(name))[1] = (current_tenant_id())::text)));
CREATE POLICY "tenant files insert" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'attachments'::text) AND ((storage.foldername(name))[1] = (current_tenant_id())::text)));
CREATE POLICY "tenant files update" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'attachments'::text) AND ((storage.foldername(name))[1] = (current_tenant_id())::text)));
CREATE POLICY "tenant files delete" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'attachments'::text) AND ((storage.foldername(name))[1] = (current_tenant_id())::text)));
INSERT INTO storage.buckets(id,name,public) VALUES ('attachments','attachments',false),('backups','backups',false) ON CONFLICT (id) DO NOTHING;
