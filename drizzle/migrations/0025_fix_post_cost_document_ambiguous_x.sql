DO $mig$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.post_cost_document(uuid)'::regprocedure);
  IF position('#variable_conflict' in def) = 0 THEN
    def := regexp_replace(def, 'AS \$function\$', E'AS $function$\n#variable_conflict use_column\n');
    EXECUTE def;
  END IF;
END $mig$;