-- Kubb Platform — Bot opponents (simulated matches) · Phase 1: schema + seed + spawn
--   A bot is a MANAGED player (players.user_id IS NULL) flagged is_bot, driven by a
--   client-side move generator that calls submit_turn for the bot's side. No engine change
--   is needed: can_act() already lets the match creator act for a managed side
--   (20260809212136_scoring_authz.sql:10), and game_state/submit_turn are reused as-is.
--
--   This migration adds:
--     - players.is_bot          flag on the bot's managed player rows
--     - matches.is_simulated    flags a bot match (leaderboard-exclusion toggle; inclusive for now)
--     - bot_profiles            per-bot stat block: the 3 fixed bots + a clone TEMPLATE
--     - seed of the 3 fixed bots (+ their shared managed players) and the clone template
--     - create_bot_match(slug, race_to)  spawns a LIVE bot match, coin-flipping first thrower
--
--   Bot naming/stats and all locked decisions: SIMULATED_MATCHES_PLAN.md (§4, §5).
--   The clone bot (per-user, derived from player_stats) is a LATER phase; create_bot_match
--   rejects it here with 'bot_unavailable'.
--
-- Apply by pasting into the Supabase SQL editor (migrations are not auto-applied).

-- ============ schema ============

alter table players add column if not exists is_bot       boolean not null default false;
alter table matches add column if not exists is_simulated boolean not null default false;

-- Per-bot stat block. Fixed bots carry a shared managed player_id; the clone template
-- has player_id NULL (a concrete clone is derived per-user in a later phase).
create table if not exists bot_profiles (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid references players(id) on delete cascade,   -- null for the clone template
  slug            text not null unique
                  check (slug in ('beginner','experienced','advanced','clone')),
  display_name    text not null,
  is_clone        boolean not null default false,
  -- stat block (all NULL on the clone template; a concrete clone block is derived per-user).
  -- Advantage-line values are NOT stored: they are derived at run time (field eff x2 uncapped,
  -- 8m accuracy x2 capped at 0.95).
  acc_8m          numeric check (acc_8m between 0 and 1),          -- 0..1 hit prob per 8m baton
  king_acc        numeric check (king_acc between 0 and 1),        -- 0..1 hit prob per king shot
  field_eff_early numeric check (field_eff_early >= 0),            -- kubbs/baton, field_before 1..4
  field_eff_mid   numeric check (field_eff_mid  >= 0),             -- field_before 5..7
  field_eff_late  numeric check (field_eff_late >= 0),             -- field_before >= 8
  consistency     numeric check (consistency between 0 and 1),     -- low/med/high -> 0.30/0.60/0.85
  sort_order      int not null default 0,                          -- picker display order
  created_at      timestamptz not null default now()
);

alter table bot_profiles enable row level security;
drop policy if exists bot_profiles_select on bot_profiles;
create policy bot_profiles_select on bot_profiles for select to authenticated using (true);
-- No insert/update/delete policies: bot_profiles is seed/RPC-managed only.

-- ============ seed: the 3 fixed bots (shared managed players) ============
-- Fixed UUIDs so the seed is idempotent and bot_profiles can reference them.

insert into players (id, user_id, display_name, created_by, is_bot) values
  ('b0700000-0000-4000-a000-000000000001', null, 'Kubb Coach - Beginner',    null, true),
  ('b0700000-0000-4000-a000-000000000002', null, 'Kubb Coach - Experienced', null, true),
  ('b0700000-0000-4000-a000-000000000003', null, 'Kubb Coach - Advanced',    null, true)
on conflict (id) do nothing;

insert into bot_profiles
  (player_id, slug, display_name, is_clone,
   acc_8m, king_acc, field_eff_early, field_eff_mid, field_eff_late, consistency, sort_order)
values
  ('b0700000-0000-4000-a000-000000000001', 'beginner',    'Kubb Coach - Beginner',    false,
     0.25, 0.50, 0.50, 0.75, 1.50, 0.30, 1),
  ('b0700000-0000-4000-a000-000000000002', 'experienced', 'Kubb Coach - Experienced', false,
     0.45, 0.75, 0.80, 1.25, 2.00, 0.60, 2),
  ('b0700000-0000-4000-a000-000000000003', 'advanced',    'Kubb Coach - Advanced',    false,
     0.65, 0.90, 1.10, 1.75, 2.50, 0.85, 3),
  (null,                                    'clone',       'Kubb Coach - Clone',       true,
     null, null, null, null, null, null, 4)
on conflict (slug) do nothing;

-- ============ create_bot_match ============
-- Spawns a live 1v1 match: caller = side A (from), bot = side B (to). No lag ceremony —
-- coin-flip the first thrower and go straight to 'live'. is_simulated = true.
-- The membership paywall (enforce_membership on matches insert) still applies: bot matches
-- are gated exactly like human matches.
create or replace function create_bot_match(p_bot_slug text, p_race_to int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me        uuid := auth.uid();
  v_my_player uuid;
  v_bot       record;
  v_match     uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if p_race_to is null or p_race_to < 1 or p_race_to > 9 then raise exception 'race_to_range'; end if;

  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then raise exception 'no_player_for_account'; end if;

  select bp.slug, bp.player_id, bp.is_clone into v_bot
  from bot_profiles bp where bp.slug = p_bot_slug;
  if v_bot.slug is null then raise exception 'unknown_bot'; end if;

  -- The clone is materialized per-user in a later phase; not playable yet.
  if v_bot.is_clone or v_bot.player_id is null then raise exception 'bot_unavailable'; end if;

  -- human = side A (from), bot = side B (to)
  v_match := _spawn_match(v_my_player, v_bot.player_id, p_race_to, v_me);

  update matches
     set is_simulated    = true,
         lag_winner_side = case when random() < 0.5 then 'A' else 'B' end,
         status          = 'live'
   where id = v_match;
  insert into games (match_id, game_number) values (v_match, 1);

  return jsonb_build_object('match_id', v_match);
end $$;

revoke all on function create_bot_match(text, int)  from public;
grant execute on function create_bot_match(text, int) to authenticated;
