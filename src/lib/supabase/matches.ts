import { createClient } from "@/lib/supabase/server";
import type { BotStats } from "@/lib/bot-engine";

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
  /** Whose input the match is waiting on ('you' | 'opponent'); null when finished/abandoned. */
  turn: "you" | "opponent" | null;
  /** True when this is a match against a bot (simulated). */
  is_simulated: boolean;
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

/** A bot opponent the user can practice against (bot_profiles seed). */
export type BotProfile = {
  slug: string;
  display_name: string;
  is_clone: boolean;
  sort_order: number;
};

/** The seeded bots, in picker order. bot_profiles has an authenticated read policy. */
export async function getBotProfiles(): Promise<BotProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bot_profiles")
    .select("slug, display_name, is_clone, sort_order")
    .order("sort_order");
  if (error || !data) return [];
  return data as BotProfile[];
}

/** For a simulated match: which side is the bot + its stat block. null for a human match. */
export type BotMatchContext = {
  bot_side: Side;
  slug: string;
  display_name: string;
  stats: BotStats;
};

export async function getBotMatchContext(matchId: string): Promise<BotMatchContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bot_match_context", { p_match_id: matchId });
  if (error || !data) return null;
  const d = data as {
    bot_side: Side;
    slug: string;
    display_name: string;
    acc_8m: number;
    king_acc: number;
    field_eff_early: number;
    field_eff_mid: number;
    field_eff_late: number;
    consistency: number;
  };
  return {
    bot_side: d.bot_side,
    slug: d.slug,
    display_name: d.display_name,
    stats: {
      acc_8m: d.acc_8m,
      king_acc: d.king_acc,
      field_eff_early: d.field_eff_early,
      field_eff_mid: d.field_eff_mid,
      field_eff_late: d.field_eff_late,
      consistency: d.consistency,
    },
  };
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
  is_simulated: boolean;
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
/** King finishing accuracy, per shot (shots > 0 => legal attacks only). */
export type KingStat = { hits: number; shots: number };
/** Per-turn 8m field-efficiency dispersion for one phase; mean/stddev null when turns = 0. */
export type PhaseDispersion = { turns: number; mean: number | null; stddev: number | null };

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
  king: KingStat;
  field_consistency: { early: PhaseDispersion; mid: PhaseDispersion; late: PhaseDispersion };
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
