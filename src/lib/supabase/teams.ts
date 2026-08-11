import { createClient } from "@/lib/supabase/server";
import type { SideMetrics } from "@/lib/supabase/matches";

export type TeamMember = {
  player_id: string;
  display_name: string;
  handle: string | null;
};

export type TeamStats = {
  team: { id: string; name: string };
  members: TeamMember[];
  metrics: SideMetrics;
  matches_counted: number;
  record: { wins: number; losses: number };
};

/** Team-as-a-whole throwing stats + roster, or null if the team doesn't exist. */
export async function getTeamStats(teamId: string): Promise<TeamStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_stats", { p_team_id: teamId });
  if (error || !data) return null;
  return data as TeamStats;
}
