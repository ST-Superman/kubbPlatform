import { createClient } from "@/lib/supabase/server";

export type Challenge = {
  id: string;
  direction: "incoming" | "outgoing";
  race_to: number;
  created_at: string;
  other_display_name: string | null;
  other_handle: string | null;
};

/** Pending challenges the signed-in member is party to (incoming + outgoing). */
export async function getMyChallenges(): Promise<Challenge[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_challenges");
  if (error || !data) return [];
  return data as Challenge[];
}
