CREATE OR REPLACE FUNCTION public.block_nonposting_docs() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
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