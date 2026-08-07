import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * Bridges Supabase's auth cookies to Next's async cookie store.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore when middleware
            // is refreshing the session (see src/lib/supabase/middleware.ts).
          }
        },
      },
    },
  );
}
