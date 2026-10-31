import { createMiddleware } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { withAppDatabase } from './app-database';

/** Delegate authentication completely to the managed middleware. */
export const requireAppDatabaseAuth = createMiddleware({ type: 'function' })
  .middleware([requireSupabaseAuth])
  .server(({ next, context }) => next({
    context: { supabase: withAppDatabase(context.supabase) },
  }));