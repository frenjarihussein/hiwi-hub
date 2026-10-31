import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { withAppDatabase } from './app-database';

// Server-only, same lazy managed client. Callers must authorize before importing.
export const appDatabaseAdmin = withAppDatabase(supabaseAdmin);