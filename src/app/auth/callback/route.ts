import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * OAuth (PKCE) callback. Providers like Apple redirect here with a `code` we
 * exchange for a session, then forward to `next`.
 *
 * The Supabase client's cookie writes are bound to the redirect `response` so the
 * session Set-Cookie headers ride the redirect. Writing them via next/headers
 * cookies() and returning a hand-built NextResponse.redirect() drops them, which
 * lands the user back on /login the first time (mobile Safari exposes this).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/dashboard";

  if (!code) return NextResponse.redirect(`${origin}/error`);

  const response = NextResponse.redirect(`${origin}${next}`);
  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/error`);
  return response;
}
