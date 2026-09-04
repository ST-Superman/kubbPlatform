// Bot move generator for simulated matches (Phase 3 of SIMULATED_MATCHES_PLAN.md).
//
// Pure, dependency-free, deterministic-under-seed. Given a bot's stat block and the live
// GameState for the bot's side, it rolls ONE legal turn as a TurnDraft — the same shape the
// human turn form produces — which the caller then validates with buildErrors() and submits
// via submit_turn. The server's validation ladder is the ultimate authority; this module aims
// to be legal by construction (the test suite asserts buildErrors() is empty for every turn it
// generates across thousands of random states).
//
// Design (see plan §6): fixed strategy, skill-only difficulty. Every bot plays the same
// policy — clear my field kubbs, then throw remaining batons at the opponent baseline, then
// attack the king once the opponent baseline is clear. Bots differ only in execution:
//   - field efficiency (kubbs/baton) by phase, chosen from field kubbs faced this turn
//     (early = 1-4, mid = 5-7, late = >= 8, matching compute_turn_metrics)
//   - 8m baseline accuracy, king accuracy
//   - consistency: reduces the chance of an underperforming field toss WITHOUT capping
//     overclears; field-clearing only (baseline/king are pure Bernoulli on their hit %).
// Holding an advantage line doubles field efficiency (uncapped) and 8m accuracy (cap 0.95).
//
// Types are imported type-only, so this file pulls in no runtime Next/server code.

import type { GameState, Side } from "@/lib/supabase/matches";
import { type TurnDraft, emptyDraft } from "@/lib/kubb-rules";

/** A bot's skill block. Mirrors the bot_profiles row (20260904110240_bot_matches.sql). */
export type BotStats = {
  acc_8m: number;          // 0..1 hit prob per baton at 8m baseline
  king_acc: number;        // 0..1 hit prob per king shot
  field_eff_early: number; // kubbs/baton, field_before 1..4
  field_eff_mid: number;   // field_before 5..7
  field_eff_late: number;  // field_before >= 8
  consistency: number;     // 0..1 (higher = fewer underperforming field tosses)
};

export type Rng = () => number; // returns a float in [0, 1)

// ---- Calibration constants (spread only; the field-efficiency MEAN is preserved
// analytically at `e`, so these never move a bot off its configured efficiency — see the
// calibration tests). ----
const BASE_UNDER = 0.5;  // P(weak toss) at consistency 0 (linearly down to 0 at consistency 1)
const WEAK_FACTOR = 0.3; // a weak toss aims at 30% of the intended per-baton efficiency
const ADV_ACC_CAP = 0.95;

// Advantage line the bot concedes when it can't clear its field: random 0-5 ft from the king
// ("0.1" = at the king). Matches the plan's "random 0-5 feet from the king".
const ADV_LINE_CONCEDE = ["0.1", "1", "2", "3", "4", "5"];

/** mulberry32 — small, fast, seedable PRNG so sims/tests are reproducible. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Knuth's algorithm for a Poisson(lambda) draw. lambda is small here (<= ~6). */
function poisson(lambda: number, rng: Rng): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

/** Per-phase field efficiency for the number of field kubbs faced this turn. */
export function phaseEff(stats: BotStats, fieldBefore: number): number {
  if (fieldBefore >= 8) return stats.field_eff_late;
  if (fieldBefore >= 5) return stats.field_eff_mid;
  return stats.field_eff_early; // 1..4 (never called with 0 — no field to clear)
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Kubbs knocked by ONE field baton, mean = `e`, spread controlled by `consistency`.
 *
 * A mixture of two Poisson draws whose blended mean is EXACTLY `e` for any consistency:
 *   - weak toss (prob pUnder): Poisson(e * WEAK_FACTOR) — an under-performing throw
 *   - normal/strong toss:      Poisson(lambdaStrong), lambdaStrong chosen so the mixture
 *                              mean stays `e`
 * Lower consistency raises pUnder, fattening the low tail (streakiness) while never capping
 * the high tail — exactly the asymmetric behavior the design calls for.
 */
export function fieldBatonKnock(e: number, consistency: number, rng: Rng): number {
  if (e <= 0) return 0;
  const pUnder = BASE_UNDER * (1 - clamp01(consistency));
  // mixture-mean preservation: pUnder*(e*WEAK_FACTOR) + (1-pUnder)*lambdaStrong = e
  const lambda =
    rng() < pUnder
      ? e * WEAK_FACTOR
      : (e * (1 - pUnder * WEAK_FACTOR)) / (1 - pUnder);
  return poisson(lambda, rng);
}

/**
 * Generate one legal turn for `side` given the live GameState. Deterministic under `rng`.
 * Legal by construction; the caller should still gate on buildErrors() before submitting.
 */
export function generateBotTurn(
  stats: BotStats,
  s: GameState,
  side: Side,
  rng: Rng = Math.random,
): TurnDraft {
  const o: Side = side === "A" ? "B" : "A";
  const cap = s.round_cap;
  const holdsAdvantage = s.advantage[side] != null;
  const d: TurnDraft = { ...emptyDraft, advantage_line: "" };

  // ---- Stage 1: clear my own field kubbs (must go first) ----
  let field = s.field[side];
  const e = phaseEff(stats, field) * (holdsAdvantage ? 2 : 1); // advantage doubles field eff
  let batonsField = 0;
  while (field > 0 && batonsField < cap) {
    field -= Math.min(field, fieldBatonKnock(e, stats.consistency, rng));
    batonsField++;
  }
  d.batons_field = batonsField;
  d.field_kubbs_left = field;

  if (field > 0) {
    // Couldn't clear within the baton cap: concede an advantage line, no baseline/king.
    d.advantage_line = ADV_LINE_CONCEDE[Math.floor(rng() * ADV_LINE_CONCEDE.length)];
    return d;
  }

  // ---- Stage 2: throw remaining batons at the opponent baseline ----
  const acc = holdsAdvantage ? Math.min(ADV_ACC_CAP, stats.acc_8m * 2) : stats.acc_8m;
  let batonsLeft = cap - batonsField;
  let baseline = s.baseline[o];
  while (batonsLeft > 0 && baseline > 0) {
    d.batons_baseline++;
    batonsLeft--;
    if (rng() < acc) {
      d.baseline_kubbs++;
      baseline--;
    }
  }

  // ---- Stage 3: attack the king (opponent baseline clear + my field clear) ----
  if (baseline === 0 && batonsLeft > 0) {
    while (batonsLeft > 0 && !d.king_hit) {
      d.king_shots++;
      batonsLeft--;
      if (rng() < stats.king_acc) d.king_hit = true;
    }
  }

  return d;
}
