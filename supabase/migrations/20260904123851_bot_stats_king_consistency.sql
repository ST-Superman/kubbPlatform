-- Kubb Platform — Bot opponents (simulated matches) · Phase 2: king accuracy + consistency
--   Extends the stats layer so the Clone bot can be derived from a real player's history.
--   Adds to the metrics JSON returned by compute_turn_metrics (and therefore match_stats /
--   player_stats / team_stats, which pass it through unchanged):
--     - king            : { hits, shots }  — king finishing accuracy per shot
--     - field_consistency: per-phase 8m field-efficiency dispersion { turns, mean, stddev }
--                          for early/mid/late (same buckets as field_efficiency). Kept
--                          per-phase on purpose so downstream can measure within-phase
--                          streakiness without the early/mid/late phase mix inflating variance.
--
--   Requires game_turn_stats to expose king_shots / king_hit, so it is DROPped and recreated
--   with two added columns (a RETURNS TABLE change can't go through create-or-replace). No
--   hard dependency blocks the drop — compute_turn_metrics calls it but Postgres does not
--   track function-body dependencies; it is redefined right after.
--
--   king accuracy is clean: submit_turn's king_too_early_range guard means king_shots > 0 is
--   only ever recorded on a legal king attack (opponent fully cleared), and king_hit_early
--   fouls carry king_shots = 0 — so they never enter this denominator.
--
--   Plan: SIMULATED_MATCHES_PLAN.md (§9). Apply by pasting into the Supabase SQL editor.

-- ============ game_turn_stats: + king_shots, king_hit passthrough ============
drop function if exists game_turn_stats(uuid);

create or replace function game_turn_stats(p_game_id uuid)
returns table (
  participant_id   uuid,
  side             text,
  throw_line       text,
  batons_field     smallint,
  batons_baseline  smallint,
  baseline_kubbs   smallint,
  base_kubb_double boolean,
  field_before     int,
  felled_field     int,
  king_shots       smallint,
  king_hit         boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  t record;
  base_a int := 5; base_b int := 5;
  field_a int := 0; field_b int := 0;
  x text; fb int; ff int; bl_total int;
begin
  for t in
    select tu.*, mp.side as t_side
    from turns tu
    join match_participants mp on mp.id = tu.participant_id
    where tu.game_id = p_game_id and tu.voided_at is null
    order by tu.seq
  loop
    x := t.t_side;
    bl_total := t.baseline_kubbs + (t.base_kubb_double)::int;
    if x = 'A' then
      fb := field_a;                          -- snapshot BEFORE mutation
      ff := field_a - t.field_kubbs_left;
      base_b  := base_b - bl_total;
      field_a := t.field_kubbs_left;
      field_b := field_b + ff + bl_total;
    else
      fb := field_b;
      ff := field_b - t.field_kubbs_left;
      base_a  := base_a - bl_total;
      field_b := t.field_kubbs_left;
      field_a := field_a + ff + bl_total;
    end if;

    participant_id   := t.participant_id;
    side             := x;
    throw_line       := t.throw_line;
    batons_field     := t.batons_field;
    batons_baseline  := t.batons_baseline;
    baseline_kubbs   := t.baseline_kubbs;
    base_kubb_double := t.base_kubb_double;
    field_before     := fb;
    felled_field     := ff;
    king_shots       := t.king_shots;
    king_hit         := t.king_hit;
    return next;
  end loop;
end $$;

-- ============ compute_turn_metrics: + king, + field_consistency ============
create or replace function compute_turn_metrics(p_participant_ids uuid[])
returns jsonb
language sql stable security definer set search_path = public as $$
  with tr as (
    select gts.*
    from match_participants mp
    join games g on g.match_id = mp.match_id
    cross join lateral game_turn_stats(g.id) gts
    where mp.id = any(p_participant_ids)
      and gts.participant_id = mp.id
  )
  select jsonb_build_object(
    'eight_meter', jsonb_build_object(
      'baseline_accuracy', jsonb_build_object(
        'hits',   coalesce(sum(baseline_kubbs)  filter (where throw_line = '8m'), 0),
        'batons', coalesce(sum(batons_baseline) filter (where throw_line = '8m'), 0)
      ),
      'field_efficiency', jsonb_build_object(
        'early', jsonb_build_object(
          'felled', coalesce(sum(felled_field) filter (where throw_line='8m' and batons_field>0 and field_before between 1 and 4), 0),
          'batons', coalesce(sum(batons_field) filter (where throw_line='8m' and batons_field>0 and field_before between 1 and 4), 0)),
        'mid', jsonb_build_object(
          'felled', coalesce(sum(felled_field) filter (where throw_line='8m' and batons_field>0 and field_before between 5 and 7), 0),
          'batons', coalesce(sum(batons_field) filter (where throw_line='8m' and batons_field>0 and field_before between 5 and 7), 0)),
        'late', jsonb_build_object(
          'felled', coalesce(sum(felled_field) filter (where throw_line='8m' and batons_field>0 and field_before>=8), 0),
          'batons', coalesce(sum(batons_field) filter (where throw_line='8m' and batons_field>0 and field_before>=8), 0))
      ),
      'baseline_doubles', coalesce(count(*) filter (where throw_line='8m' and base_kubb_double), 0)
    ),
    'advantage', jsonb_build_object(
      'baseline_accuracy', jsonb_build_object(
        'hits',   coalesce(sum(baseline_kubbs)  filter (where throw_line = 'advantage'), 0),
        'batons', coalesce(sum(batons_baseline) filter (where throw_line = 'advantage'), 0)
      ),
      'field_efficiency', jsonb_build_object(
        'felled', coalesce(sum(felled_field) filter (where throw_line='advantage' and batons_field>0), 0),
        'batons', coalesce(sum(batons_field) filter (where throw_line='advantage' and batons_field>0), 0)
      ),
      'baseline_doubles', coalesce(count(*) filter (where throw_line='advantage' and base_kubb_double), 0)
    ),
    -- king finishing accuracy (per shot). king_shots>0 => legal attack only; early-king
    -- fouls carry king_shots=0 and so never enter the denominator.
    'king', jsonb_build_object(
      'hits',  coalesce(sum(king_hit::int), 0),
      'shots', coalesce(sum(king_shots),    0)
    ),
    -- per-phase 8m field-efficiency dispersion (mean/stddev over per-turn kubbs-per-baton).
    -- mean/stddev are null when a phase has no qualifying turns. Kept per-phase so downstream
    -- consistency derivation isn't confounded by the early/mid/late efficiency gap.
    'field_consistency', jsonb_build_object(
      'early', jsonb_build_object(
        'turns',  coalesce(count(*) filter (where throw_line='8m' and batons_field>0 and field_before between 1 and 4), 0),
        'mean',   avg(felled_field::numeric / batons_field)        filter (where throw_line='8m' and batons_field>0 and field_before between 1 and 4),
        'stddev', stddev_pop(felled_field::numeric / batons_field) filter (where throw_line='8m' and batons_field>0 and field_before between 1 and 4)),
      'mid', jsonb_build_object(
        'turns',  coalesce(count(*) filter (where throw_line='8m' and batons_field>0 and field_before between 5 and 7), 0),
        'mean',   avg(felled_field::numeric / batons_field)        filter (where throw_line='8m' and batons_field>0 and field_before between 5 and 7),
        'stddev', stddev_pop(felled_field::numeric / batons_field) filter (where throw_line='8m' and batons_field>0 and field_before between 5 and 7)),
      'late', jsonb_build_object(
        'turns',  coalesce(count(*) filter (where throw_line='8m' and batons_field>0 and field_before>=8), 0),
        'mean',   avg(felled_field::numeric / batons_field)        filter (where throw_line='8m' and batons_field>0 and field_before>=8),
        'stddev', stddev_pop(felled_field::numeric / batons_field) filter (where throw_line='8m' and batons_field>0 and field_before>=8))
    )
  )
  from tr;
$$;

-- ============ grants (drop cleared game_turn_stats grants; re-establish) ============
revoke all on function game_turn_stats(uuid)        from public;
revoke all on function compute_turn_metrics(uuid[]) from public;
grant execute on function game_turn_stats(uuid)        to authenticated;
grant execute on function compute_turn_metrics(uuid[]) to authenticated;
