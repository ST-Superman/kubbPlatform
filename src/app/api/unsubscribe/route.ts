import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * One-tap unsubscribe from challenge emails — no login required.
 *
 * The token is the recipient's notification_prefs.unsub_token, carried in the
 * email's List-Unsubscribe header and footer link. unsubscribe_by_token is a
 * SECURITY DEFINER RPC granted to anon, so a logged-out click still works.
 *
 *  POST  — RFC 8058 one-click (the inbox "Unsubscribe" button). Returns 200.
 *  GET   — the footer link. Flips the pref, then redirects to a friendly page.
 */
async function unsubscribe(token: string | null): Promise<boolean> {
  if (!token) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unsubscribe_by_token", { p_token: token });
  if (error) return false;
  return Boolean((data as { ok?: boolean } | null)?.ok);
}

export async function POST(req: NextRequest) {
  const ok = await unsubscribe(req.nextUrl.searchParams.get("token"));
  // One-click clients only care about a 2xx; body is informational.
  return NextResponse.json({ ok });
}

export async function GET(req: NextRequest) {
  const ok = await unsubscribe(req.nextUrl.searchParams.get("token"));
  const dest = new URL("/settings/notifications", req.nextUrl.origin);
  dest.searchParams.set(ok ? "done" : "error", "1");
  return NextResponse.redirect(dest);
}
