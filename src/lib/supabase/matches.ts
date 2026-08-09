import { createClient } from "@/lib/supabase/server";

export type Side = "A" | "B";

export type Participant = {
  participant_id: string;
  player_id: string | null;
  team_id: string | null;
  display_name: string | null;
  user_id: string | null;
};

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
};

export type MatchSummary = {
  match_id: string;
  status: MatchStatus;
  race_to: number;
  created_at: string;
  my_side: Side | null;
  opponent: string | null;
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
