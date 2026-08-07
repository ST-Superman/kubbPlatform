import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
};

/**
 * Loads the signed-in user's profile row. Returns null if there is no
 * authenticated user or (defensively) no profile row yet — the signup
 * trigger + backfill should always produce one.
 */
export async function getMyProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, handle, display_name, avatar_url, created_at")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile | null) ?? null;
}
