"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function friendlyClaimError(message: string | undefined): string {
  const code = message?.match(/[a-z_]+/)?.[0];
  switch (code) {
    case "auth_required":
      return "Please sign in again to claim this identity.";
    case "already_claimed":
      return "This identity was just claimed by someone else.";
    case "expired":
      return "This claim link has expired.";
    case "not_found":
      return "This claim link is no longer valid.";
    case "account_already_claimed_identity":
      return "Your account has already claimed a managed player.";
    default:
      return message ?? "Something went wrong. Please try again.";
  }
}

/**
 * Binds the managed player behind `token` to the signed-in account. On success the
 * token is consumed (single-use), so we redirect away from the now-dead claim landing:
 * to `next` when provided (e.g. back into the match the invite came from), else the
 * standalone success page.
 */
export async function claimPlayer(
  token: string,
  next?: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_player", {
    p_claim_token: token,
  });

  if (error) {
    return { error: friendlyClaimError(error.message) };
  }

  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  const name = (data as { display_name?: string } | null)?.display_name ?? "";
  redirect(safeNext ?? `/claim/done?name=${encodeURIComponent(name)}`);
}
