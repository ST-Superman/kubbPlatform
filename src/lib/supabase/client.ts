import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Supabase client for use in Client Components (runs in the browser).
 * Reads the public URL + anon key from env.
 */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}
