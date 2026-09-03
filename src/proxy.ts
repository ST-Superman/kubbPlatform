import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js "proxy" convention (formerly "middleware"). Runs on every matched
// request to refresh the Supabase auth session and guard protected routes.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (they authenticate themselves; the Stripe webhook has no session
     *   and must not be redirected to /login, and API calls must skip the onboarding gate)
     * - _next/static, _next/image (build assets)
     * - favicon.ico and common static file extensions
     * Widen this as the app grows.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
