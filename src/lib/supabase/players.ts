import { createClient } from "@/lib/supabase/server";

export type ManagedPlayer = {
  id: string;
  display_name: string;
  created_at: string;
  claim_token: string;
  expires_at: string;
};

/**
 * Loads the unclaimed managed players the signed-in user created, joined to their
 * current claim token. `player_claims` has no select policy, so this read goes
 * through a SECURITY DEFINER RPC (`list_my_managed_players`) rather than PostgREST.
 *
 * Returns [] when there is no authenticated user.
 */
export async function getMyManagedPlayers(): Promise<ManagedPlayer[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc("list_my_managed_players");
  if (error || !data) return [];

  return data as ManagedPlayer[];
}
