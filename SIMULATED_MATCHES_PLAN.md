# Simulated Matches (Bot Opponents) — Implementation Plan

> Status: **DRAFT for review.** Decisions below are locked with the site owner; the
> algorithm constants are tunable and validated by a calibration harness (see §8).

## 1. Goal

Let a signed-in user play a full, real, scored 1v1 kubb match against a computer opponent
("bot"). The bot generates a legal turn in response to each of the user's turns, at a
difficulty set by the chosen bot. Four bots ship in v1:

| Bot | Source of skill |
|---|---|
| Kubb Coach — Beginner | fixed stat block |
| Kubb Coach — Experienced | fixed stat block |
| Kubb Coach — Advanced | fixed stat block |
| Kubb Coach — Clone | derived from the signed-in user's own history (unlocks after 5 completed matches) |

## 2. Locked decisions

- **Web portal only** for v1; the sim engine is written so it can be lifted into the iOS
  app later (pure TS module, no React/DOM dependency).
- **1v1 only.** No teams.
- **Coin flip** decides who throws first. No lag ceremony for bot matches.
- **Fixed strategy, skill-only difficulty.** Every bot plays the *same* policy (clear my
  field kubbs → throw remaining batons at your baseline → attack the king once your
  baseline is clear). Bots differ only in *execution* (accuracy / efficiency). If the dice
  don't clear all field kubbs, batons run out and an advantage line is conceded — as a
  consequence, never as a "decision."
- **Probabilistic** simulation.
- **Advantage line doubles both** field efficiency (uncapped: 1.5 → 3.0 kubbs/baton) **and**
  8m accuracy (capped at 95%), for whichever side holds the line that turn.
- **Consistency is asymmetric and field-only:** it reduces the chance a toss *under*performs
  and never caps *over*clearing; it applies only to field clearing (baseline/king misses are
  already governed by their hit %).
- **Bot matches are gated** by the membership paywall, exactly like human matches.
- **Bot matches feed the leaderboard and personal stats now.** Build an exclusion toggle so
  they can be pulled out of the leaderboard later without a migration.
- **Reveal UX:** brief animated reveal of the bot's turn (batons thrown, kubbs knocked, king
  shots).
- Coaching layer (post-match "here's where the bot beat you") is **out of scope for v1**, but
  the data model must not preclude it.
- `base_kubb_double` (a single baton clearing the last field kubb *and* carrying into a
  baseline kubb) is **ignored for v1** — genuinely rare.

## 3. Architecture

The match engine is **event-sourced**: `turns` is append-only, and `game_state()` replays it
to derive score, whose turn it is (`next_side`), the baton cap (`round_cap` = 2/4/6), field
kubbs, baseline remaining, and advantage lines. Nothing about scoring is stored — it's
always replayed. See `20260808053111_match_engine.sql`.

**A bot is a managed player.** `can_act()` already lets the match creator score *both* sides
when the opponent is a `players` row with `user_id IS NULL` (the "managed opponent" pattern —
`20260809212136_scoring_authz.sql:10`). So:

1. The user plays their own turn through the **existing** turn form → `submit_turn` for side A.
2. On the bot's turn, a **move generator** reads `game_state`, rolls a legal turn against the
   bot's stat block, and calls `submit_turn` for side B.
3. Both turns are real, persisted, replayable, and spectatable. `submit_turn`'s validation
   ladder guarantees the bot's move is legal.

**The move generator runs client-side for v1** (a pure TS module beside
`src/lib/kubb-rules.ts`, reusing its `buildErrors()` for the legality gate). Bot matches are
practice/onboarding, so client-side generation is acceptable. The module is written so it can
be promoted to a Supabase RPC / edge function later if bot matches ever need to be
tamper-proof or run server-side (e.g. the bot "playing" while the user is away).

## 4. Data model changes

New migration (redefine-in-new-migration pattern). No existing tables are altered
destructively.

- **`players.is_bot boolean not null default false`** — marks the 4 bot rows. Bots are
  **not claimable** (no `player_claims` row).
- **`bot_profiles`** — the stat block, one row per bot:
  ```
  bot_profiles(
    id                uuid pk,
    player_id         uuid fk -> players(id),   -- the managed player this profile drives
    slug              text unique,              -- 'beginner' | 'experienced' | 'advanced' | 'clone'
    display_name      text,
    is_clone          boolean default false,    -- clone is per-user, derived at match creation
    -- stat block (null for the clone template; filled at spawn time from player_stats):
    acc_8m            numeric,                  -- 0..1 baseline hit prob at 8m
    king_acc          numeric,                  -- 0..1 king hit prob per shot
    field_eff_early   numeric,                  -- kubbs/baton, field_before 1..4
    field_eff_mid     numeric,                  -- field_before 5..7
    field_eff_late    numeric,                  -- field_before >= 8
    consistency       numeric,                  -- 0..1 (low/med/high -> 0.3/0.6/0.85)
    created_at        timestamptz default now()
  )
  ```
- **`matches.is_simulated boolean not null default false`** — flags a bot match. Cheap to
  set at spawn, and it's the switch the leaderboard/stats queries read so bot matches can be
  excluded later by flipping one predicate (per the "build the toggle" decision).
- **Seed** the 3 fixed bots + their managed `players` rows + `bot_profiles`. The Clone is a
  template row (`is_clone = true`, stats null); a concrete clone stat block is materialized
  per-user when a clone match is created.

**Spawn path.** Add `create_bot_match(p_bot_slug text, p_race_to int)`:
- Resolves the bot's managed player (for Clone: the caller's own clone, gated on ≥5 matches —
  see §7), inserts the match via the existing `_spawn_match` internals with
  `is_simulated = true`, coin-flips `lag_winner_side`, flips status to `live`, inserts game 1.
- Returns `match_id`. No challenge/accept (same as managed opponents).

## 5. Final bot stat blocks

Per baton unless noted. Advantage-line values are derived (×2 rule), not stored.

| Stat | Beginner | Experienced | Advanced | Clone |
|---|---|---|---|---|
| 8m baseline accuracy | 25% | 45% | 65% | measured |
| Field efficiency — early (1–4 kubbs) | 0.50 | 0.80 | 1.10 | measured |
| Field efficiency — mid (5–7) | 0.75 | 1.25 | 1.75 | measured |
| Field efficiency — late (≥8) | 1.50 | 2.00 | 2.50 | measured |
| King accuracy (per shot) | 50% | 75% | 90% | measured |
| Consistency | 0.30 (low) | 0.60 (med) | 0.85 (high) | measured |

**Phase is selected by field kubbs faced this turn** (`field_before`): 1–4 → early, 5–7 →
mid, ≥8 → late. This matches `compute_turn_metrics`.

**Advantage line held:** field efficiency ×2 (uncapped), 8m accuracy → `min(0.95, acc×2)`.

## 6. Move generator algorithm

Input: `game_state` for the bot's side X — baton cap `C`, my field kubbs `F`, opponent
baseline remaining `Bo`, opponent field remaining `Fo`, whether I hold an advantage line
`adv`. Output: one `TurnDraft`, validated by `buildErrors()`.

Effective stats for the turn: `e_phase = phaseEff(F) × (adv ? 2 : 1)`;
`a = adv ? min(0.95, acc_8m × 2) : acc_8m`.

**Stage 1 — clear my field kubbs.** For each baton (until `F` cleared or batons exhausted),
draw kubbs knocked `k` with mean `e_phase`:
  - With probability `p_under = BASE_UNDER × (1 − consistency)`, this is a weak toss:
    `k = floor(e_phase × U)`, `U ~ Uniform(0,1)`.
  - Otherwise: `k = round(e_phase + overshoot)`, `overshoot ~ Exp(λ_over)` (small, positive) —
    overclearing is always possible and **not** dampened by consistency.
  - Clamp `k` to field kubbs remaining.
  `BASE_UNDER`, `λ_over` are calibration constants (§8). Consistency 0.30/0.60/0.85 →
  p_under ≈ 0.35 / 0.20 / 0.075 at BASE_UNDER = 0.5 (Advanced very rarely blanks — matches
  intent). Remaining standing field kubbs → `field_kubbs_left`.

**Stage 2 — baseline throws** (only if my field is fully cleared). Each leftover baton is a
Bernoulli(`a`) hit; a hit fells one baseline kubb (clamp to `Bo`). Stop when `Bo` hits 0.

**Stage 3 — attack the king** (only if opponent is fully clear: `Bo == 0` and `Fo == 0`).
Each remaining baton is Bernoulli(`king_acc`); the first hit sets `king_hit = true`,
`finished = true`. `king_shots` = shots taken.

**Emit.** Map stage baton counts onto `{batons_field, batons_baseline, baseline_kubbs,
field_kubbs_left, king_shots, king_hit, throw_line, advantage_line}`. The exact relationship
between `king_shots` and `batons_baseline` is read from `kubb-rules.ts` at implementation time
(don't guess it). If `field_kubbs_left > 0`, set `throw_line`/`advantage_line` for the
conceded line = **random in {at-king (0.1), 1, 2, 3, 4, 5} ft** (0–5 ft from the king). Run
the draft through `buildErrors()`; on any violation, clamp and re-emit (should be rare — the
policy is legal by construction).

**King legality note:** verify against `buildErrors()` whether opponent *field* (`Fo`) must be
0 for a legal king shot, not just baseline. The generator guards on both; the validation
ladder is the source of truth.

## 7. Clone bot

- **Unlock gate:** ≥5 completed 1v1 matches (live or vs bot). `player_stats(handle)` already
  returns `matches_counted` over finished 1v1 matches — use it as the gate signal.
- **Derivation (at clone-match spawn):** read `player_stats` for the caller and map:
  - `acc_8m` ← `eight_meter.baseline_accuracy` (hits/batons)
  - `field_eff_{early,mid,late}` ← `eight_meter.field_efficiency.{early,mid,late}` (felled/batons)
  - `king_acc` ← **new king-accuracy metric (see §9)**
  - `consistency` ← **new variance metric (see §9)**, mapped onto the 0..1 scale
  - Advantage behavior: apply the same ×2 rule to the clone's 8m/field stats (consistent with
    the other bots) rather than the player's measured advantage stats.
- Materialize a per-user clone `bot_profiles` row (or compute on the fly and store a snapshot
  on the match for reproducibility/coaching later).

## 8. Calibration harness (test)

The underperform branch drags the realized mean below `e`, so constants must be tuned so each
bot's realized kubbs/baton ≈ its target. Add a Monte-Carlo test that, per bot × phase, runs N
simulated field-clears and asserts realized mean efficiency and 8m/king hit rates fall within
tolerance of the table in §5. This is the source of truth for `BASE_UNDER`, `λ_over`, and the
consistency→p_under mapping. Also add deterministic unit tests (seeded RNG) for: field-only
turns, advantage-line ×2, king-win turns, running-out-of-batons → conceded advantage line, and
`buildErrors()` acceptance of every emitted draft.

## 9. Stats-layer additions (prerequisite for Clone) — ✅ DONE (`20260904123851_bot_stats_king_consistency.sql`)

`game_turn_stats` extended to pass through `king_shots` / `king_hit`; `compute_turn_metrics`
(and therefore `match_stats` / `player_stats` / `team_stats`) now also returns:
- **`king`** — `{ hits, shots }`. `king_shots > 0` is only ever a legal king attack (the
  `king_too_early_range` guard), and early-king fouls carry `king_shots = 0`, so the
  denominator is clean.
- **`field_consistency`** — per-phase 8m field-efficiency dispersion `{ turns, mean, stddev }`
  for early/mid/late (same buckets as `field_efficiency`). Kept **per-phase on purpose**: a
  single cross-phase variance would conflate the early→late efficiency gap with actual
  streakiness. The **0..1 consistency normalization is deferred to Phase 6** (clone
  derivation), where it's calibrated against the generator's `consistency → p_under` mapping.
- `PlayerStats` / `SideMetrics` TS types extended (`KingStat`, `PhaseDispersion`).

## 10. Frontend changes

- **Opponent picker** (`src/components/matches-client.tsx`): add a "Play a bot" section
  listing the 4 bots. Clone is shown locked with progress ("3/5 matches") until the gate is
  met. Selecting a bot calls `create_bot_match` and routes to the match.
- **Match play** (`src/components/match-client.tsx`): after a human `submit_turn` in a
  simulated match, invoke the generator for the bot side, then `submit_turn` for side B. Wrap
  the bot turn in the animated reveal. The existing realtime subscription already re-renders
  from `match_state`; the reveal is a client-side presentation layer over the returned state.
- **Bot identity:** a small "BOT" badge on the opponent panel and in `list_my_matches` rows.
- Reuse the existing `list_my_matches.turn` field — a managed/bot opponent already yields
  `turn = 'you'` (`20260904020551_matches_turn.sql:52`), so the "Your Turn" split works
  unchanged; the reveal fills the moment between the two `submit_turn` calls.

## 11. Paywall / leaderboard / stats wiring

- **Paywall:** bot matches insert into `matches`/`turns`, so `enforce_membership()` already
  gates them. No change needed (matches the decision to gate bot matches).
- **Leaderboard & stats:** ✅ bot matches count now. There is no cross-player leaderboard yet;
  the W/L "record" lives in `player_profile`. `platform_config.record_excludes_sims` (default
  false) is the ready toggle — flip it true and `player_profile` stops counting sim matches
  toward wins/losses (they stay listed + badged). Deliberately **not** applied to `player_stats`
  (throwing metrics + the clone unlock gate), so flipping it can't silently re-lock a Clone or
  rewrite skill metrics.

## 12. Phasing

1. **Schema + seed** — ✅ **DONE** (`20260904110240_bot_matches.sql`, applied). `players.is_bot`,
   `bot_profiles`, `matches.is_simulated`, seed 3 bots + clone template, `create_bot_match`.
2. **Stats additions** — ✅ **DONE** (`20260904123851_bot_stats_king_consistency.sql`). King
   accuracy + per-phase consistency metric; extended `SideMetrics`/`PlayerStats` types. (§9)
3. **Move generator module + tests** — ✅ **DONE** (`src/lib/bot-engine.ts`,
   `src/lib/bot-engine.test.ts`, `vitest.config.ts`; added `vitest@2` dev dep + `test` script).
   Pure TS; field clear uses a mean-preserving Poisson mixture (constants `BASE_UNDER=0.5`,
   `WEAK_FACTOR=0.3` control spread only). 16 tests green: per-phase mean calibration,
   consistency→variance ordering, advantage ×2, baseline/king accuracy, and buildErrors-clean
   legality across 30k random states. (§6, §8)
4. **Opponent picker + bot-match creation UI** — ✅ **DONE**. `getBotProfiles()` +
   `BotProfile` (`matches.ts`), fetched in `matches/page.tsx`; "Practice vs Kubb Coach" card in
   `matches-client.tsx` (race-to + 4-bot grid) calls `create_bot_match` and routes into the
   match. Clone is locked with `N/5` progress (from finished matches) until Phase 6. (§10)
5. **Bot-turn wiring + animated reveal** — ✅ **DONE**. `bot_match_context` RPC
   (`20260904132417_bot_match_context.sql`) + `getBotMatchContext` feed `MatchClient` a
   `botCtx`. `canAct` returns false for the bot side (so no manual form); a `(game_id:seq)`-keyed
   effect generates the bot's turn, shows a "🤖 …is throwing → summary" banner, and submits.
   Handles bot-first (coin flip) and cross-game turns. (§10)
6. **Clone derivation + unlock gate** — ✅ **DONE** (`20260904134241_bot_clone.sql`).
   `matches.bot_stats` snapshot column; shared clone bot player; `derive_clone_stats` (from
   `player_stats`, with fallbacks + a heuristic CV→consistency map); clone-aware
   `create_bot_match` (gates on ≥5 matches, snapshots the block); snapshot-aware
   `bot_match_context`. Picker unlocks Clone at 5 finished matches. (§7)
7. **SIM badges + record toggle** — ✅ **DONE** (`20260904144257_bot_sim_badges.sql`).
   `is_simulated` exposed on `list_my_matches` + `player_profile` rows → "SIM" pill in
   `MatchRowContent` (matches list, dashboard, both profiles via `WatchMatchRow`) + the
   in-match header (via `botCtx`). `platform_config.record_excludes_sims` (default false)
   lets `player_profile` drop sims from the W/L record later; `player_stats` stays inclusive
   so the toggle can't re-lock a Clone. (§11)

## 13. Open items / risks

- ✅ **`king_shots` vs `batons_baseline`** — resolved: separate buckets; `used = batons_field +
  batons_baseline + king_shots ≤ round_cap` (`kubb-rules.ts:82`).
- ✅ **King legality vs opponent field** — resolved: `buildErrors` gates king shots on *my*
  field clear + *opponent baseline* clear only; opponent field is not checked (`kubb-rules.ts:109`).
- ✅ **Calibration tolerances** — resolved: seeded PRNG makes the harness deterministic (no
  flakiness); field mean asserted within 0.05 of target.
- ✅ **Clone reproducibility** — resolved: the derived stat block is snapshotted onto
  `matches.bot_stats` at creation (stable for the match's life; available to a future coaching
  view). `bot_match_context` coalesces the snapshot over `bot_profiles`.
- **Clone consistency is a heuristic** — per-turn field variance is Poisson-dominated, so the
  CV→consistency map (clamped [0.4, 0.85], 0.6 fallback) is approximate; revisit with real data.
- **iOS reuse** — the generator is web-API-free (pure TS + injected RNG), so a future Swift
  port or a shared server RPC stays cheap.
