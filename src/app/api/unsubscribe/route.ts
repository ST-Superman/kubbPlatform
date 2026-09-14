import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * One-tap unsubscribe — no login required.
 *
 * The token is the recipient's notification_prefs.unsub_token, carried in the
 * email's List-Unsubscribe header and footer link. The RPCs are SECURITY DEFINER
 * granted to anon, so a logged-out click still works.
 *
 *  ?kind=messages → turns message emails off (dm_email_cadence = 'in_app').
 *  (default)      → turns challenge emails off.
 *
 *  POST  — RFC 8058 one-click (the inbox "Unsubscribe" button). Returns 200.
 *  GET   — the footer link. Flips the pref, then redirects to a friendly page.
 */
async function unsubscribe(token: string | null, kind: string | null): Promise<boolean> {
  if (!token) return false;
  const supabase = await createClient();
  const rpc = kind === "messages" ? "unsubscribe_messages_by_token" : "unsubscribe_by_token";
  const { data, error } = await supabase.rpc(rpc, { p_token: token });
  if (error) return false;
  return Boolean((data as { ok?: boolean } | null)?.ok);
}

export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ok = await unsubscribe(sp.get("token"), sp.get("kind"));
  // One-click clients only care about a 2xx; body is informational.
  return NextResponse.json({ ok });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ok = await unsubscribe(sp.get("token"), sp.get("kind"));
  const dest = new URL("/settings/notifications", req.nextUrl.origin);
  dest.searchParams.set(ok ? "done" : "error", "1");
  return NextResponse.redirect(dest);
}
