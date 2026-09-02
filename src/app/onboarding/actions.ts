"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Claims the managed profile whose organizer-set contact email matches the signed-in
 * user's email (surfaced at onboarding by my_claimable_profile). Tokenless — the email
 * match is the authorization. Folds any signup self-row history into the managed row
 * server-side via _claim_managed_player.
 */
export async function claimMatchedProfile(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_matched_profile");

  if (error) {
    const code = error.message?.match(/[a-z_]+/)?.[0];
    switch (code) {
      case "no_match":
        return { error: "We couldn't find a matching profile to claim." };
      case "account_already_claimed_identity":
        return { error: "Your account has already claimed a managed player." };
      case "auth_required":
        return { error: "Please sign in again." };
      default:
        return { error: error.message ?? "Something went wrong. Please try again." };
    }
  }

  return {};
}
