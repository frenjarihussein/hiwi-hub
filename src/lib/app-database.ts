import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './app-database.types';

export type AppDatabaseClient = SupabaseClient<Database>;

/** Preserve the original application contract while Cloud's generated schema is empty.
 * This changes types only: credentials, transport, auth and RLS are untouched.
 * It does not create tables or restore data in the newly connected database.
 */
export function withAppDatabase(client: object): AppDatabaseClient {
  return client as AppDatabaseClient;
}