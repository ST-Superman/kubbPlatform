// Client-side UX mirrors of the server match engine, ported verbatim from the Match Loop
// Prototype's Component (design_handoff_kubb_platform_spike/design_refs/Match Loop Prototype.dc.html).
// The server (submit_turn) remains authoritative — these only drive instant form feedback
// (baton counter, disabled submit, inline error) and the turn-log text.

import { type GameState, type Side, type TurnRow } from "@/lib/supabase/matches";

export type TurnDraft = {
  batons_field: number;
  batons_baseline: number;
  baseline_kubbs: number;
  base_kubb_double: boolean;
  penalty_kubbs: number;
  field_kubbs_left: number;
  advantage_line: string;
  king_shots: number;
  king_hit: boolean;
  king_hit_early: boolean;
};

export const emptyDraft: TurnDraft = {
  batons_field: 0,
  batons_baseline: 0,
  baseline_kubbs: 0,
  base_kubb_double: false,
  penalty_kubbs: 0,
  field_kubbs_left: 0,
  advantage_line: "6",
  king_shots: 0,
  king_hit: false,
  king_hit_early: false,
};

const opp = (x: Side): Side => (x === "A" ? "B" : "A");

export function advLineLabel(v: string | null): string {
  if (v == null || v === "") return "";
  if (v === "0.1" || v === ".1") return "at the King";
  if (v === "13") return "at the Baseline";
  return `${v} ft from the King`;
}

export const LAG_OPTIONS: { v: string; label: string }[] = [
  { v: "", label: "Select lag…" },
  { v: "0.1", label: "Touching the King" },
  ...Array.from({ length: 24 }, (_, i) => ({
    v: String(i + 1),
    label: `${i + 1} inch${i + 1 > 1 ? "es" : ""} from the King`,
  })),
  { v: "98", label: "Not even close" },
  { v: "99", label: "Knocked down the King" },
];

export const ADV_LINE_OPTIONS: { v: string; label: string }[] = [
  { v: "0.1", label: "At the King" },
  ...Array.from({ length: 12 }, (_, i) => ({
    v: String(i + 1),
    label: `${i + 1} ft from the King`,
  })),
  { v: "13", label: "At the Baseline" },
];

/** Max legal baseline hits: capped by batons thrown + remaining opponent baseline (double counts as one). */
export function maxBaselineHits(s: GameState, d: TurnDraft, side: Side): number {
  return Math.max(
    0,
    Math.min(d.batons_baseline, s.baseline[opp(side)] - (d.base_kubb_double ? 1 : 0)),
  );
}

/** The buildErrors ladder — same order, same copy as the prototype. First entry blocks submit. */
export function buildErrors(s: GameState, d: TurnDraft, x: Side): string[] {
  const o = opp(x);
  const errs: string[] = [];
  const cap = s.round_cap;
  const used = d.batons_field + d.batons_baseline + d.king_shots;
  const fieldX = s.field[x];
  const baseO = s.baseline[o];

  if (used > cap)
    errs.push(`Only ${cap} batons this round — field + baseline + king shots together.`);
  if (used === 0 && !d.king_hit_early) errs.push("Enter at least one baton.");
  if (d.batons_field === 0 && fieldX - d.field_kubbs_left > 0)
    errs.push("Field kubbs went down — record the batons used to clear them.");
  if (
    d.field_kubbs_left > 0 &&
    (d.batons_baseline > 0 ||
      d.baseline_kubbs > 0 ||
      d.base_kubb_double ||
      d.king_shots > 0 ||
      d.king_hit)
  )
    errs.push("Field kubbs left standing — no baseline or king throws this turn.");
  if (d.base_kubb_double && fieldX === 0)
    errs.push("A base kubb double needs a field kubb on the board.");
  if (d.baseline_kubbs > d.batons_baseline)
    errs.push("Baseline hits cannot exceed batons thrown at the baseline.");
  if (d.baseline_kubbs + (d.base_kubb_double ? 1 : 0) > baseO)
    errs.push(`Only ${baseO} baseline kubbs remain — the double counts as one of them.`);
  if (baseO === 0 && d.batons_baseline > 0)
    errs.push("No baseline kubbs remain — throws at the king are King Shots.");
  const baseClear = baseO - d.baseline_kubbs - (d.base_kubb_double ? 1 : 0) === 0;
  if (d.king_shots > 0 && !(baseClear && d.field_kubbs_left === 0))
    errs.push("King shots are legal only after all field AND baseline kubbs are down.");
  if (d.king_hit && d.king_shots === 0) errs.push("King hit needs at least one king shot.");
  if (d.king_hit && d.king_hit_early)
    errs.push("Pick one — king hit (win) or early king (foul).");
  return errs;
}

/** Human-readable turn summary for the log + waiting feed (omits the felled count, not stored). */
export function turnText(t: TurnRow): string {
  if (t.king_hit_early) return "Hit the King EARLY — foul, game to the opponent.";
  const parts: string[] = [];
  if (t.batons_field > 0 || t.field_kubbs_left > 0) {
    let f = `${t.batons_field} baton(s) at the field`;
    if (t.field_kubbs_left > 0)
      f += ` — ${t.field_kubbs_left} left standing, Advantage Line ${advLineLabel(t.advantage_line)}`;
    parts.push(f);
  }
  if (t.batons_baseline > 0)
    parts.push(
      `${t.batons_baseline} baton(s) at the baseline from ${
        t.throw_line === "advantage" ? "the advantage line" : "8 meters"
      }, hit ${t.baseline_kubbs}`,
    );
  if (t.base_kubb_double) parts.push("a Base Kubb Double");
  if (t.penalty_kubbs > 0) parts.push(`${t.penalty_kubbs} Penalty Kubb(s)`);
  if (t.king_shots > 0)
    parts.push(`${t.king_shots} King Shot(s)${t.king_hit ? " — KING DOWN, game over" : ""}`);
  return parts.join(" · ") + ".";
}
