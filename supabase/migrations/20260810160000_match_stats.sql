-- Kubb Platform — Match statistics (throwing metrics)
--   Derives per-side throwing metrics from the append-only `turns` log:
--     1. 8m baseline accuracy        (baseline_kubbs / batons_baseline, throw_line='8m')
--     2. 8m field efficiency         (felled_field / batons_field) bucketed by phase
--     3. advantage baseline accuracy + advantage field efficiency (throw_line='advantage')
--     4. baseline doubles            (count of base_kubb_double, split 8m vs advantage)
--
--   Layers:
--     game_turn_stats(game)     — replay primitive; emits one augmented row per live turn,
--                                 snapshotting field_before (standing field kubbs at turn start).
--     compute_turn_metrics(ids) — the ONE place the metric math lives; aggregates over a set
--                                 of match_participants (sides).
--     match_stats / player_stats / team_stats — thin RPCs that supply participant-id sets.
--
--   Rates are pooled and returned as raw {num, den} counts so the UI can show denominators
--   inline. Filters: voided turns excluded; player/team aggregates count finished matches only
--   and exclude the test player.
--
-- Apply with: supabase db push

-- ============ game_turn_stats: replay primitive with field_before snapshot ============
-- Mirrors the game_state() replay loop (20260809160045_realtime_and_harness.sql:32-61) but
-- captures each thrower's field count BEFORE the turn's mutation and returns per-turn rows.
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
  felled_field     int
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
    return next;
  end loop;
end $$;

-- ============ compute_turn_metrics: pooled aggregation → metrics JSON ============
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
    )
  )
  from tr;
$$;

-- ============ match_stats: both sides of one match ============
create or replace function match_stats(p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  st text; pa_a uuid; pa_b uuid; part jsonb;
begin
  select status into st from matches where id = p_match_id;
  if st is null then return null; end if;

  select id into pa_a from match_participants where match_id = p_match_id and side = 'A';
  select id into pa_b from match_participants where match_id = p_match_id and side = 'B';

  select jsonb_object_agg(s.side, s.info) into part from (
    select mp.side,
      jsonb_build_object(
        'participant_id', mp.id,
        'player_id',      mp.player_id,
        'team_id',        mp.team_id,
        'display_name',   coalesce(pl.display_name, tm.name),
        'handle',         pr.handle::text
      ) as info
    from match_participants mp
    left join players  pl on pl.id = mp.player_id
    left join profiles pr on pr.id = pl.user_id
    left join teams    tm on tm.id = mp.team_id
    where mp.match_id = p_match_id
  ) s;

  return jsonb_build_object(
    'status',       st,
    'games_won',    match_games_won(p_match_id),
    'participants', part,
    'A', compute_turn_metrics(array[pa_a]),
    'B', compute_turn_metrics(array[pa_b])
  );
end $$;

-- ============ player_stats: singles (1v1) aggregate + teams the player belongs to ============
create or replace function player_stats(p_handle citext) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_pid uuid; v_user uuid;
  test_id constant uuid := '06dd1461-5ec6-4de2-a61d-017bf2e30e92';
  ids uuid[]; cnt int; teams_arr jsonb;
begin
  select p.id, p.user_id into v_pid, v_user
  from players p join profiles pr on pr.id = p.user_id
  where pr.handle = p_handle;
  if v_pid is null then return null; end if;

  -- The player's own sides in finished 1v1 matches, excluding matches vs the test player.
  select array_agg(mine.id), count(*) into ids, cnt
  from match_participants mine
  join matches m on m.id = mine.match_id
  join match_participants opp on opp.match_id = mine.match_id and opp.side <> mine.side
  where mine.player_id = v_pid
    and m.status = 'finished'
    and opp.player_id is not null          -- 1v1: opponent is an individual, not a team
    and opp.player_id <> test_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', tt.id, 'name', tt.name) order by tt.name), '[]'::jsonb)
    into teams_arr
  from team_members tmm join teams tt on tt.id = tmm.team_id
  where tmm.player_id = v_pid;

  return jsonb_build_object(
    'metrics',         compute_turn_metrics(coalesce(ids, '{}'::uuid[])),
    'matches_counted', coalesce(cnt, 0),
    'teams',           teams_arr
  );
end $$;

-- ============ team_stats: team-as-a-whole aggregate + roster ============
create or replace function team_stats(p_team_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_name text; ids uuid[]; cnt int; members jsonb;
begin
  select name into v_name from teams where id = p_team_id;
  if v_name is null then return null; end if;

  select array_agg(mp.id), count(*) into ids, cnt
  from match_participants mp
  join matches m on m.id = mp.match_id
  where mp.team_id = p_team_id
    and m.status = 'finished';

  select coalesce(jsonb_agg(jsonb_build_object(
      'player_id', pl.id, 'display_name', pl.display_name, 'handle', pr.handle::text
    ) order by pl.display_name), '[]'::jsonb) into members
  from team_members tmm
  join players  pl on pl.id = tmm.player_id
  left join profiles pr on pr.id = pl.user_id
  where tmm.team_id = p_team_id;

  return jsonb_build_object(
    'team',            jsonb_build_object('id', p_team_id, 'name', v_name),
    'members',         members,
    'metrics',         compute_turn_metrics(coalesce(ids, '{}'::uuid[])),
    'matches_counted', coalesce(cnt, 0)
  );
end $$;

-- ============ grants ============
revoke all on function game_turn_stats(uuid)         from public;
revoke all on function compute_turn_metrics(uuid[])  from public;
revoke all on function match_stats(uuid)             from public;
revoke all on function player_stats(citext)          from public;
revoke all on function team_stats(uuid)              from public;
grant execute on function game_turn_stats(uuid)        to authenticated;
grant execute on function compute_turn_metrics(uuid[]) to authenticated;
grant execute on function match_stats(uuid)            to authenticated;
grant execute on function player_stats(citext)         to authenticated;
grant execute on function team_stats(uuid)             to authenticated;
