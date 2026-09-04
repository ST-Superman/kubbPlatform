-- Kubb Platform — Bot opponents (simulated matches) · Phase 6: the Clone bot
--   The Clone mirrors the signed-in player's own game, derived from their history via
--   player_stats (which now carries king accuracy + per-phase field-efficiency dispersion,
--   added in Phase 2). Unlocks after 5 completed matches (live or vs bots).
--
--   Model: ONE shared clone bot player (like the fixed bots), but each clone match SNAPSHOTS
--   the deriving player's stat block onto matches.bot_stats at creation time. That makes the
--   clone reproducible (stable for the life of the match, and available to a future coaching
--   view) and keeps bot_match_context a simple read — no per-user bot_profiles rows.
--
--   Adds: matches.bot_stats; a clone bot player + bot_profiles.clone.player_id; _safe_ratio;
--   derive_clone_stats; clone-aware create_bot_match; snapshot-aware bot_match_context.
--
--   CONSISTENCY CAVEAT: per-turn field-efficiency variance is dominated by Poisson noise, so
--   consistency is only weakly identifiable from a handful of matches. The CV->consistency
--   map below is a deliberate heuristic (clamped to [0.4, 0.85], 0.6 fallback); revisit once
--   there's real play data. The skill stats (accuracies, efficiencies) are well-identified.
--
-- Apply by pasting into the Supabase SQL editor.

-- ============ snapshot column ============
alter table matches add column if not exists bot_stats jsonb;  -- clone matches only; null for fixed bots

-- ============ clone bot player + link ============
insert into players (id, user_id, display_name, created_by, is_bot) values
  ('b0700000-0000-4000-a000-000000000004', null, 'Kubb Coach - Clone', null, true)
on conflict (id) do nothing;

update bot_profiles set player_id = 'b0700000-0000-4000-a000-000000000004'
 where slug = 'clone' and player_id is null;

-- ============ helpers ============
create or replace function _safe_ratio(num numeric, den numeric, dflt numeric)
returns numeric language sql immutable set search_path = public as $$
  select case when den is null or den = 0 then dflt else num / den end;
$$;
revoke all on function _safe_ratio(numeric, numeric, numeric) from public;

-- Derive a clone stat block for a user from their player_stats. Returns null if the user has
-- no player/handle. Includes matches_counted so the caller can gate on it.
create or replace function derive_clone_stats(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_handle citext;
  ps jsonb; m jsonb; fc jsonb;
  ph text; t int; mn numeric; sd numeric;
  cv_sum numeric := 0; cv_wt numeric := 0; cons numeric;
begin
  select handle into v_handle from profiles where id = p_user;
  if v_handle is null then return null; end if;
  ps := player_stats(v_handle);
  if ps is null then return null; end if;

  m := ps->'metrics'->'eight_meter';

  -- consistency: pooled coefficient of variation of per-turn 8m field efficiency, over phases
  -- with a usable sample (>=3 turns). Heuristic map, clamped; medium (0.6) when no data.
  fc := ps->'metrics'->'field_consistency';
  foreach ph in array array['early','mid','late'] loop
    t  := coalesce((fc->ph->>'turns')::int, 0);
    mn := (fc->ph->>'mean')::numeric;
    sd := (fc->ph->>'stddev')::numeric;
    if t >= 3 and mn is not null and mn > 0 and sd is not null then
      cv_sum := cv_sum + (sd / mn) * t;
      cv_wt  := cv_wt + t;
    end if;
  end loop;
  if cv_wt > 0 then
    cons := greatest(0.4, least(0.85, 1.1 - cv_sum / cv_wt));
  else
    cons := 0.6;
  end if;

  return jsonb_build_object(
    'matches_counted', coalesce((ps->>'matches_counted')::int, 0),
    'acc_8m',   round(_safe_ratio((m->'baseline_accuracy'->>'hits')::numeric,   (m->'baseline_accuracy'->>'batons')::numeric,   0.45), 4),
    'king_acc', round(_safe_ratio((ps->'metrics'->'king'->>'hits')::numeric,    (ps->'metrics'->'king'->>'shots')::numeric,    0.70), 4),
    'field_eff_early', round(_safe_ratio((m->'field_efficiency'->'early'->>'felled')::numeric, (m->'field_efficiency'->'early'->>'batons')::numeric, 0.80), 4),
    'field_eff_mid',   round(_safe_ratio((m->'field_efficiency'->'mid'->>'felled')::numeric,   (m->'field_efficiency'->'mid'->>'batons')::numeric,   1.25), 4),
    'field_eff_late',  round(_safe_ratio((m->'field_efficiency'->'late'->>'felled')::numeric,  (m->'field_efficiency'->'late'->>'batons')::numeric,  2.00), 4),
    'consistency', round(cons, 4)
  );
end $$;
revoke all on function derive_clone_stats(uuid) from public;

-- ============ create_bot_match (clone-aware) ============
create or replace function create_bot_match(p_bot_slug text, p_race_to int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me        uuid := auth.uid();
  v_my_player uuid;
  v_bot       record;
  v_match     uuid;
  v_stats     jsonb;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if p_race_to is null or p_race_to < 1 or p_race_to > 9 then raise exception 'race_to_range'; end if;

  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then raise exception 'no_player_for_account'; end if;

  select bp.slug, bp.player_id, bp.is_clone into v_bot
  from bot_profiles bp where bp.slug = p_bot_slug;
  if v_bot.slug is null or v_bot.player_id is null then raise exception 'unknown_bot'; end if;

  -- Clone: derive the caller's stat block now and gate on >= 5 completed matches.
  if v_bot.is_clone then
    v_stats := derive_clone_stats(v_me);
    if v_stats is null or coalesce((v_stats->>'matches_counted')::int, 0) < 5 then
      raise exception 'clone_locked';
    end if;
  end if;

  -- human = side A (from), bot = side B (to)
  v_match := _spawn_match(v_my_player, v_bot.player_id, p_race_to, v_me);

  update matches
     set is_simulated    = true,
         lag_winner_side  = case when random() < 0.5 then 'A' else 'B' end,
         status           = 'live',
         bot_stats        = case when v_bot.is_clone then (v_stats - 'matches_counted') else null end
   where id = v_match;
  insert into games (match_id, game_number) values (v_match, 1);

  return jsonb_build_object('match_id', v_match);
end $$;

revoke all on function create_bot_match(text, int)  from public;
grant execute on function create_bot_match(text, int) to authenticated;

-- ============ bot_match_context (snapshot-aware) ============
-- Prefer the per-match snapshot (clone); fall back to the live bot_profiles row (fixed bots).
create or replace function bot_match_context(p_match_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bot_side',        mp.side,
    'slug',            bp.slug,
    'display_name',    bp.display_name,
    'acc_8m',          coalesce((m.bot_stats->>'acc_8m')::numeric,          bp.acc_8m),
    'king_acc',        coalesce((m.bot_stats->>'king_acc')::numeric,        bp.king_acc),
    'field_eff_early', coalesce((m.bot_stats->>'field_eff_early')::numeric, bp.field_eff_early),
    'field_eff_mid',   coalesce((m.bot_stats->>'field_eff_mid')::numeric,   bp.field_eff_mid),
    'field_eff_late',  coalesce((m.bot_stats->>'field_eff_late')::numeric,  bp.field_eff_late),
    'consistency',     coalesce((m.bot_stats->>'consistency')::numeric,     bp.consistency)
  )
  from matches m
  join match_participants mp on mp.match_id = m.id
  join players p            on p.id = mp.player_id and p.is_bot
  join bot_profiles bp      on bp.player_id = p.id
  where m.id = p_match_id and m.is_simulated
  limit 1;
$$;
revoke all on function bot_match_context(uuid)  from public;
grant execute on function bot_match_context(uuid) to authenticated;
