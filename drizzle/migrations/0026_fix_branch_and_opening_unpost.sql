DO $mig$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.post_cost_document(uuid)'::regprocedure);
  def := replace(def, 'AND nature<>''closing'' AND can_see_branch(branch_id))', 'AND nature<>''closing'')');
  EXECUTE def;
  def := pg_get_functiondef('public.unpost_document(uuid)'::regprocedure);
  def := replace(def, 'AND debit=0 AND (cap IS NULL OR account_id=cap) ORDER BY credit DESC LIMIT 1', 'AND debit=0 AND credit>0 ORDER BY (account_id IS NOT DISTINCT FROM cap) DESC, credit DESC LIMIT 1');
  EXECUTE def;
END $mig$;