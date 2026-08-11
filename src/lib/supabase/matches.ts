import { createClient } from "@/lib/supabase/server";

export type Side = "A" | "B";

export type Participant = {
  participant_id: string;
  player_id: string | null;
  team_id: string | null;
  display_name: string | null;
  user_id: string | null;
  handle: string | null;
};

export type MatchResult = "won" | "lost" | null;

export type GameState = {
  baseline: Record<Side, number>;
  field: Record<Side, number>;
  advantage: Record<Side, string | null>;
  king_shots: Record<Side, number>;
  winner: Side | null;
  next_side: Side | null;
  seq: number;
  round_cap: number;
};

export type MatchStatus = "created" | "live" | "finished" | "abandoned";

export type GameSummary = { game_number: number; winner: Side | null };

export type TurnRow = {
  seq: number;
  side: Side;
  voided: boolean;
  batons_field: number;
  batons_baseline: number;
  baseline_kubbs: number;
  base_kubb_double: boolean;
  penalty_kubbs: number;
  field_kubbs_left: number;
  advantage_line: string | null;
  king_shots: number;
  king_hit: boolean;
  king_hit_early: boolean;
  throw_line: "8m" | "advantage";
};

export type MatchState = {
  match_id: string;
  race_to: number;
  status: MatchStatus;
  lag: { winner_side: Side | null; a: string | null; b: string | null };
  participants: Partial<Record<Side, Participant>>;
  games_won: Record<Side, number>;
  games: GameSummary[];
  current_game_id: string | null;
  current_state: GameState | null;
  current_turns: TurnRow[];
  last_game_id: string | null;
  next_seq: number | null;
  undo_target: { game_id: string; seq: number } | null;
  winner_side: Side | null;
  by_forfeit: boolean;
};

export type MatchSummary = {
  match_id: string;
  status: MatchStatus;
  race_to: number;
  created_at: string;
  my_side: Side | null;
  opponent: string | null;
  opponent_handle: string | null;
  games_won: Record<Side, number>;
  result: MatchResult;
};

/** Matches the signed-in user created or plays in (newest first). */
export async function getMyMatches(): Promise<MatchSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_matches");
  if (error || !data) return [];
  return data as MatchSummary[];
}

/** Full replayed state for one match, or null if it doesn't exist / not readable. */
export async function getMatchState(matchId: string): Promise<MatchState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_state", {
    p_match_id: matchId,
  });
  if (error || !data) return null;
  return data as MatchState;
}

export type Opponent = {
  player_id: string;
  display_name: string;
  handle: string | null;
  kind: "account" | "managed";
};

/** Selectable opponents: other real accounts + the caller's own managed players. */
export async function getOpponents(): Promise<Opponent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_opponents");
  if (error || !data) return [];
  return data as Opponent[];
}

export type ProfileMatch = {
  match_id: string;
  status: MatchStatus;
  race_to: number;
  created_at: string;
  my_side: Side | null;
  opponent: string | null;
  opponent_handle: string | null;
  games_won: Record<Side, number>;
  result: MatchResult;
};

export type PlayerProfile = {
  player: {
    id: string;
    user_id: string | null;
    handle: string;
    display_name: string;
    avatar_url: string | null;
    created_at: string;
  };
  record: { wins: number; losses: number };
  matches: ProfileMatch[];
};

/** Public player profile (record + match history) by handle, or null if unknown. */
export async function getPlayerProfile(handle: string): Promise<PlayerProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("player_profile", {
    p_handle: handle,
  });
  if (error || !data) return null;
  return data as PlayerProfile;
}

// ---- Throwing statistics (see supabase/migrations/*_match_stats.sql) ----

/** A pooled rate returned as raw counts so the UI can show the denominator inline. */
export type AccuracyStat = { hits: number; batons: number };
export type PhaseStat = { felled: number; batons: number };

/** Per-side throwing metrics, split by throwing line. */
export type SideMetrics = {
  eight_meter: {
    baseline_accuracy: AccuracyStat;
    field_efficiency: { early: PhaseStat; mid: PhaseStat; late: PhaseStat };
    baseline_doubles: number;
  };
  advantage: {
    baseline_accuracy: AccuracyStat;
    field_efficiency: PhaseStat;
    baseline_doubles: number;
  };
};

export type MatchStats = {
  status: MatchStatus;
  games_won: Record<Side, number>;
  participants: Partial<
    Record<Side, { participant_id: string; player_id: string | null; team_id: string | null; display_name: string | null; handle: string | null }>
  >;
  A: SideMetrics;
  B: SideMetrics;
};

export type PlayerStats = {
  metrics: SideMetrics;
  matches_counted: number;
  teams: { id: string; name: string }[];
};

/** Per-side stats for one match (both sides), or null if the match doesn't exist. */
export async function getMatchStats(matchId: string): Promise<MatchStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_stats", { p_match_id: matchId });
  if (error || !data) return null;
  return data as MatchStats;
}

/** Singles (1v1) throwing stats + team memberships for a player, or null if unknown. */
export async function getPlayerStats(handle: string): Promise<PlayerStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("player_stats", { p_handle: handle });
  if (error || !data) return null;
  return data as PlayerStats;
}

/** Read-only match state for a spectate/play token — used by the public /watch page. */
export async function getMatchStateByToken(token: string): Promise<MatchState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_state_by_token", {
    p_token: token,
  });
  if (error || !data) return null;
  const d = data as MatchState & { error?: string };
  if (d.error) return null;
  return d;
}
