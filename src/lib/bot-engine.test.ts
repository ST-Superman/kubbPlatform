// Tests + Monte-Carlo calibration for the bot move generator (plan §6/§8).
// Run with: npm test   (vitest). Deterministic under a seeded PRNG, so no flakiness.

import { describe, it, expect } from "vitest";
import type { GameState, Side } from "@/lib/supabase/matches";
import { buildErrors } from "@/lib/kubb-rules";
import {
  type BotStats,
  mulberry32,
  fieldBatonKnock,
  phaseEff,
  generateBotTurn,
} from "@/lib/bot-engine";

// The three fixed bots — mirror the bot_profiles seed (20260904110240_bot_matches.sql).
const BOTS: Record<string, BotStats> = {
  beginner:    { acc_8m: 0.25, king_acc: 0.5,  field_eff_early: 0.5, field_eff_mid: 0.75, field_eff_late: 1.5, consistency: 0.3 },
  experienced: { acc_8m: 0.45, king_acc: 0.75, field_eff_early: 0.8, field_eff_mid: 1.25, field_eff_late: 2.0, consistency: 0.6 },
  advanced:    { acc_8m: 0.65, king_acc: 0.9,  field_eff_early: 1.1, field_eff_mid: 1.75, field_eff_late: 2.5, consistency: 0.85 },
};

const PHASES: [string, number][] = [["early", 3], ["mid", 6], ["late", 10]];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs: number[]) => {
  const m = mean(xs);
  return mean(xs.map((x) => (x - m) ** 2));
};

/** Build a GameState for `side`'s turn. Only field[side], baseline[opp], advantage[side],
 *  round_cap are read by the generator / buildErrors; the rest are valid fillers. */
function makeState(opts: {
  side: Side;
  round_cap: number;
  fieldSide: number;
  baseOpp: number;
  advantage?: string | null;
}): GameState {
  const { side, round_cap, fieldSide, baseOpp } = opts;
  const adv = opts.advantage ?? null;
  return {
    baseline: { A: side === "A" ? 5 : baseOpp, B: side === "B" ? 5 : baseOpp } as Record<Side, number>,
    field: { A: side === "A" ? fieldSide : 0, B: side === "B" ? fieldSide : 0 } as Record<Side, number>,
    advantage: { A: side === "A" ? adv : null, B: side === "B" ? adv : null } as Record<Side, string | null>,
    king_shots: { A: 0, B: 0 } as Record<Side, number>,
    winner: null,
    next_side: side,
    seq: 1,
    round_cap,
  };
}

// ============ Calibration: field-efficiency MEAN is preserved per phase ============
// The whole point of the mixture model: realized kubbs/baton == the bot's configured
// efficiency for that phase, for every consistency level.
describe("field efficiency mean matches each bot's configured value", () => {
  const N = 200_000;
  for (const [name, b] of Object.entries(BOTS)) {
    for (const [phase, fieldBefore] of PHASES) {
      it(`${name} / ${phase}`, () => {
        const rng = mulberry32(0xc0ffee + fieldBefore * 7 + name.length);
        const e = phaseEff(b, fieldBefore);
        const xs = Array.from({ length: N }, () => fieldBatonKnock(e, b.consistency, rng));
        expect(mean(xs)).toBeCloseTo(e, 1); // within 0.05 of target
      });
    }
  }
});

// ============ Consistency reduces spread without moving the mean ============
describe("lower consistency = more streaky (higher variance), same mean", () => {
  const N = 200_000;
  const e = 1.5;
  const rows = [0.3, 0.6, 0.85].map((c) => {
    const rng = mulberry32(0xbeef + Math.round(c * 100));
    const xs = Array.from({ length: N }, () => fieldBatonKnock(e, c, rng));
    return { c, mean: mean(xs), var: variance(xs) };
  });
  it("mean stays at e for all consistency levels", () => {
    for (const r of rows) expect(r.mean).toBeCloseTo(e, 1);
  });
  it("variance strictly decreases as consistency increases", () => {
    expect(rows[0].var).toBeGreaterThan(rows[1].var);
    expect(rows[1].var).toBeGreaterThan(rows[2].var);
  });
});

// ============ Advantage line doubles field efficiency ============
describe("advantage line ~doubles realized field efficiency", () => {
  it("advanced late: felled/baton with advantage is ~2x without", () => {
    const b = BOTS.advanced;
    const runs = 40_000;
    const perBaton = (advantage: string | null) => {
      const rng = mulberry32(advantage ? 111 : 222);
      let felled = 0;
      let batons = 0;
      for (let i = 0; i < runs; i++) {
        // huge field so 6 batons never clear it -> no early stop, minimal clamp bias
        const d = generateBotTurn(
          b,
          makeState({ side: "A", round_cap: 6, fieldSide: 40, baseOpp: 5, advantage }),
          "A",
          rng,
        );
        felled += 40 - d.field_kubbs_left;
        batons += d.batons_field;
      }
      return felled / batons;
    };
    const ratio = perBaton("3") / perBaton(null);
    expect(ratio).toBeGreaterThan(1.85);
    expect(ratio).toBeLessThan(2.15);
  });
});

// ============ Baseline accuracy (with and without advantage) ============
describe("baseline hit rate matches 8m accuracy", () => {
  const runs = 60_000;
  const hitRate = (b: BotStats, advantage: string | null) => {
    const rng = mulberry32(advantage ? 7 : 9);
    let hits = 0;
    let thrown = 0;
    for (let i = 0; i < runs; i++) {
      // field already clear, baseline so large it never clears in 6 batons -> all 6 are
      // baseline throws, no king, no early stop.
      const d = generateBotTurn(
        b,
        makeState({ side: "A", round_cap: 6, fieldSide: 0, baseOpp: 60, advantage }),
        "A",
        rng,
      );
      hits += d.baseline_kubbs;
      thrown += d.batons_baseline;
    }
    return hits / thrown;
  };
  it("beginner ~0.25 at 8m, ~0.50 from advantage", () => {
    expect(hitRate(BOTS.beginner, null)).toBeCloseTo(0.25, 1);
    expect(hitRate(BOTS.beginner, "3")).toBeCloseTo(0.5, 1);
  });
  it("advanced ~0.65 at 8m, capped ~0.95 from advantage", () => {
    expect(hitRate(BOTS.advanced, null)).toBeCloseTo(0.65, 1);
    expect(hitRate(BOTS.advanced, "3")).toBeCloseTo(0.95, 1);
  });
});

// ============ King finishing ============
describe("king finish rate matches 1-(1-p)^cap", () => {
  it("beginner king_acc 0.5 over 6 shots", () => {
    const runs = 80_000;
    const rng = mulberry32(1234);
    let wins = 0;
    for (let i = 0; i < runs; i++) {
      // field clear + opponent baseline clear -> all batons are king shots (until a hit)
      const d = generateBotTurn(
        BOTS.beginner,
        makeState({ side: "A", round_cap: 6, fieldSide: 0, baseOpp: 0 }),
        "A",
        rng,
      );
      expect(d.king_shots).toBeGreaterThan(0);
      expect(d.king_shots).toBeLessThanOrEqual(6);
      if (d.king_hit) wins++;
    }
    expect(wins / runs).toBeCloseTo(1 - 0.5 ** 6, 1); // ~0.984
  });
});

// ============ Legality: every generated turn passes buildErrors + server-only rules ======
describe("generated turns are always legal", () => {
  it("buildErrors is empty and server-only invariants hold across random states", () => {
    const rng = mulberry32(0x5eed);
    const bots = Object.values(BOTS);
    for (let i = 0; i < 30_000; i++) {
      const side: Side = rng() < 0.5 ? "A" : "B";
      const o: Side = side === "A" ? "B" : "A";
      const round_cap = [2, 4, 6][Math.floor(rng() * 3)];
      const fieldSide = Math.floor(rng() * 13); // 0..12
      const baseOpp = Math.floor(rng() * 6); // 0..5
      const advantage = rng() < 0.4 ? String(1 + Math.floor(rng() * 12)) : null;
      const b = bots[Math.floor(rng() * bots.length)];
      const s = makeState({ side, round_cap, fieldSide, baseOpp, advantage });
      const d = generateBotTurn(b, s, side, rng);

      expect(buildErrors(s, d, side)).toEqual([]);

      const used = d.batons_field + d.batons_baseline + d.king_shots;
      expect(used).toBeLessThanOrEqual(round_cap);
      expect(used).toBeGreaterThan(0);
      expect(d.field_kubbs_left).toBeGreaterThanOrEqual(0);
      expect(d.field_kubbs_left).toBeLessThanOrEqual(fieldSide);
      expect(d.base_kubb_double).toBe(false);
      expect(d.penalty_kubbs).toBe(0);
      expect(d.king_hit_early).toBe(false);
      expect(d.baseline_kubbs).toBeLessThanOrEqual(d.batons_baseline);
      expect(d.baseline_kubbs).toBeLessThanOrEqual(s.baseline[o]);

      if (d.field_kubbs_left > 0) {
        // conceded advantage line required by submit_turn; no baseline/king this turn
        expect(d.advantage_line).not.toBe("");
        expect(d.batons_field).toBe(round_cap);
        expect(d.batons_baseline).toBe(0);
        expect(d.baseline_kubbs).toBe(0);
        expect(d.king_shots).toBe(0);
        expect(d.king_hit).toBe(false);
      }
      if (d.king_shots > 0) {
        expect(d.field_kubbs_left).toBe(0);
        expect(s.baseline[o] - d.baseline_kubbs).toBe(0); // opponent baseline cleared
      }
    }
  });
});
