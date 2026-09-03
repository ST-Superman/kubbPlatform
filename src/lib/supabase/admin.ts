import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabaseUrl } from "./env";

/**
 * Service-role Supabase client for trusted server contexts ONLY (e.g. the Stripe
 * webhook). Bypasses RLS, so it must never be reachable from the browser — it reads
 * SUPABASE_SERVICE_ROLE_KEY, which is server-only and never NEXT_PUBLIC.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to your Vercel env (server-only).",
    );
  }
  return createSupabaseClient(getSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
