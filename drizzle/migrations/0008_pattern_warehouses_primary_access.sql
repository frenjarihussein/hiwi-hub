ALTER TABLE public.doc_patterns ADD COLUMN IF NOT EXISTS warehouse_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS primary_pattern_denied jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.enforce_primary_pattern_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE denied jsonb;
BEGIN
  IF NEW.pattern_id IS NOT NULL OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT ts.primary_pattern_denied -> (auth.uid())::text INTO denied FROM public.tenant_settings ts WHERE ts.tenant_id = NEW.tenant_id;
  IF denied IS NOT NULL AND jsonb_typeof(denied) = 'array' AND denied ? NEW.doc_type THEN
    RAISE EXCEPTION 'لا تملك صلاحية استخدام النمط الأساسي لهذا المستند؛ استخدم نمطاً مخصصاً لك';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_primary_pattern_access ON public.documents;
CREATE TRIGGER trg_enforce_primary_pattern_access BEFORE INSERT ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_primary_pattern_access();