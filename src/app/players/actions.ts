"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type PlayersState = { error?: string; message?: string } | undefined;

// Maps the RPC's raise-exception codes to friendly copy.
function friendly(code: string | undefined, fallback: string): string {
  switch (code) {
    case "auth_required":
      return "You must be signed in.";
    case "name_required":
      return "Enter a name for the player.";
    case "forbidden":
      return "That player isn't yours to manage.";
    case "already_claimed":
      return "That identity has already been claimed.";
    case "not_found":
      return "That player no longer exists.";
    default:
      return fallback;
  }
}

// Supabase surfaces a raised exception's text in error.message; our RPCs raise
// bare codes like `name_required`, so match the leading token.
function codeOf(message: string | undefined): string | undefined {
  return message?.match(/[a-z_]+/)?.[0];
}

export async function createManagedPlayer(
  _prev: PlayersState,
  formData: FormData,
): Promise<PlayersState> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (displayName.length === 0) {
    return { error: "Enter a name for the player." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_managed_player", {
    p_display_name: displayName,
  });

  if (error) {
    return { error: friendly(codeOf(error.message), error.message) };
  }

  revalidatePath("/players");
  return { message: `Added ${displayName}. Share their claim link below.` };
}

export async function regenerateClaimToken(
  playerId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_claim_token", {
    p_player_id: playerId,
  });

  if (error) {
    return { error: friendly(codeOf(error.message), error.message) };
  }

  revalidatePath("/players");
  return {};
}
