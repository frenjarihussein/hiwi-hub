import { supabase } from '@/integrations/supabase/client';
import { withAppDatabase } from './app-database';

export const appDatabase = withAppDatabase(supabase);