-- Kubb Platform — Phase 2 (Increment 1): Match-engine schema + setup/replay
-- Ports the MATCH-ENGINE half of design_handoff_kubb_platform_spike/schema.sql and the
-- game_state replay from functions.sql. Authoritative rules: the Match Loop Prototype
-- (design_refs/Match Loop Prototype.dc.html) — replay()/submitLag()/roundCap(). Do NOT
-- re-derive the rules. The turns table is APPEND-ONLY; score / whose-turn / legal ranges
-- are always replayed, never stored.
--
-- Identity tables (profiles/players/player_claims/teams) already exist. This adds the
-- match objects + four RPCs (game_state, create_match, submit_lag, match_state). The
-- write path (submit_turn, rewind_to) + realtime + UI are LATER increments.
--
-- Apply with: supabase db push

-- ============ TABLES ============

create table if not exists matches (
  id              uuid primary key default gen_random_uuid(),
  race_to         int  not null default 2 check (race_to between 1 and 9),
  status          text not null default 'created'
                  check (status in ('created','live','finished','abandoned')),
  -- lag happens ONCE per match; game N first thrower = odd → lag winner, even → lag loser
  lag_winner_side text check (lag_winner_side in ('A','B')),
  lag_value_a     text,   -- '0.1' touching | '1'..'24' inches | '98' not close | '99' knocked king
  lag_value_b     text,
  league_id       uuid,   -- later phases
  tournament_id   uuid,   -- later phases
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now()
);

-- A SIDE in a match: exactly one of player (1v1 only) or team (any side of 2+).
create table if not exists match_participants (
  id        uuid primary key default gen_random_uuid(),
  match_id  uuid not null references matches(id) on delete cascade,
  side      text not null check (side in ('A','B')),
  player_id uuid references players(id),
  team_id   uuid references teams(id),
  role      text not null default 'player' check (role in ('player','scorekeeper')),
  check ((player_id is null) <> (team_id is null)),
  unique (match_id, side)
);

-- Who ACTUALLY played (snapshot at match time; roster edits never rewrite history)
create table if not exists match_lineups (
  participant_id uuid not null references match_participants(id) on delete cascade,
  player_id      uuid not null references players(id),
  primary key (participant_id, player_id)
);

create table if not exists games (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references matches(id) on delete cascade,
  game_number int  not null,
  created_at  timestamptz not null default now(),
  unique (match_id, game_number)
);

-- APPEND-ONLY source of truth. Score/whose-turn/legal ranges are replayed, never stored.
create table if not exists turns (
  id               uuid primary key,     -- CLIENT-generated: resubmit = conflict no-op
  game_id          uuid not null references games(id) on delete cascade,
  participant_id   uuid not null references match_participants(id),  -- the SIDE, never an individual
  seq              int  not null,
  batons_field     smallint not null default 0,
  batons_baseline  smallint not null default 0,
  throw_line       text not null default '8m' check (throw_line in ('8m','advantage')),
  baseline_kubbs   smallint not null default 0,  -- NORMAL throws only; double adds +1 (gotcha!)
  base_kubb_double boolean  not null default false,
  penalty_kubbs    smallint not null default 0,
  field_kubbs_left smallint not null default 0,
  advantage_line   text,  -- null | '0.1' at king | '1'..'12' ft | '13' at baseline
  king_shots       smallint not null default 0,
  king_hit         boolean not null default false,
  king_hit_early   boolean not null default false,
  finished         boolean not null default false,  -- the ONLY game-end trigger
  created_at       timestamptz not null default now(),
  voided_at        timestamptz  -- rewind = batch soft-void seq N..latest, never cherry-pick
);
-- rewound seqs get reused → uniqueness only among live turns
create unique index if not exists turns_game_seq_live on turns (game_id, seq) where voided_at is null;
create index if not exists turns_game_idx on turns (game_id, seq);

-- Scoped tokens: "score as side X in match Y" without every participant logged in.
-- No client policies AT ALL; checked inside RPCs only. (Unused until a later increment.)
create table if not exists match_tokens (
  token          uuid primary key default gen_random_uuid(),
  match_id       uuid not null references matches(id) on delete cascade,
  participant_id uuid references match_participants(id),
  scope          text not null check (scope in ('play','spectate','scorekeeper')),
  expires_at     timestamptz
);

-- ============ ROW LEVEL SECURITY ============

alter table matches            enable row level security;
alter table match_participants enable row level security;
alter table match_lineups      enable row level security;
alter table games              enable row level security;
alter table turns              enable row level security;
alter table match_tokens       enable row level security;  -- no policies → RPC-only

-- Spike: authenticated read-all; tighten to participant/spectate-token scope in Phase 3.
-- Writes to games/turns/lineups/participants go ONLY through SECURITY DEFINER RPCs.
drop policy if exists matches_select on matches;
create policy matches_select on matches for select to authenticated using (true);
drop policy if exists matches_insert on matches;
create policy matches_insert on matches for insert to authenticated with check (created_by = auth.uid());
drop policy if exists participants_select on match_participants;
create policy participants_select on match_participants for select to authenticated using (true);
drop policy if exists lineups_select on match_lineups;
create policy lineups_select on match_lineups for select to authenticated using (true);
drop policy if exists games_select on games;
create policy games_select on games for select to authenticated using (true);
drop policy if exists turns_select on turns;
create policy turns_select on turns for select to authenticated using (true);

-- ============ game_state: derive game state from the turn log ============
-- Port of replay() in the prototype. A game is <50 turns; this is microseconds.
create or replace function game_state(p_game_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t record;
  base_a int := 5; base_b int := 5;      -- baseline standing per side
  field_a int := 0; field_b int := 0;    -- field kubbs each side must clear on its attack
  adv_a text; adv_b text;                -- advantage line held (consumed on use)
  ks_a int := 0; ks_b int := 0;          -- cumulative king shots
  rounds int := 0;                        -- GLOBAL turn index (baton cap: 2,4,6,6…)
  winner text; next_side text;
  x text; felled_field int; bl_total int;
begin
  select case when g2.game_number % 2 = 1 then m.lag_winner_side
              when m.lag_winner_side = 'A' then 'B' else 'A' end
    into next_side
  from games g2 join matches m on m.id = g2.match_id where g2.id = p_game_id;

  for t in
    select tu.*, mp.side from turns tu
    join match_participants mp on mp.id = tu.participant_id
    where tu.game_id = p_game_id and tu.voided_at is null
    order by tu.seq
  loop
    x := t.side; rounds := rounds + 1;
    if x = 'A' then ks_a := ks_a + t.king_shots; else ks_b := ks_b + t.king_shots; end if;
    if t.king_hit_early and t.finished then
      winner := case when x = 'A' then 'B' else 'A' end; exit;
    end if;
    bl_total := t.baseline_kubbs + (t.base_kubb_double)::int;
    if x = 'A' then
      felled_field := field_a - t.field_kubbs_left;
      base_b := base_b - bl_total;
      field_a := t.field_kubbs_left;                  -- left standing stays in attacker's queue
      field_b := field_b + felled_field + bl_total;   -- everything felled → opponent's queue
      adv_a := null;                                   -- consumed
      adv_b := case when t.field_kubbs_left > 0 then t.advantage_line end;
    else
      felled_field := field_b - t.field_kubbs_left;
      base_a := base_a - bl_total;
      field_b := t.field_kubbs_left;
      field_a := field_a + felled_field + bl_total;
      adv_b := null;
      adv_a := case when t.field_kubbs_left > 0 then t.advantage_line end;
    end if;
    if t.king_hit and t.finished then winner := x; exit; end if;
    next_side := case when x = 'A' then 'B' else 'A' end;
  end loop;

  return jsonb_build_object(
    'baseline', jsonb_build_object('A', base_a, 'B', base_b),
    'field',    jsonb_build_object('A', field_a, 'B', field_b),
    'advantage',jsonb_build_object('A', adv_a, 'B', adv_b),
    'king_shots',jsonb_build_object('A', ks_a, 'B', ks_b),
    'winner', winner, 'next_side', next_side,
    'round_cap', case when rounds + 1 = 1 then 2 when rounds + 1 = 2 then 4 else 6 end);
end $$;

-- ============ create_match ============
-- 1v1 only for the spike: side A = caller, side B = opponent resolved by @handle.
create or replace function create_match(p_race_to int, p_opponent_handle text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_handle citext := ltrim(btrim(coalesce(p_opponent_handle, '')), '@');
  v_my_player uuid; v_opp_player uuid;
  v_match uuid; v_pa uuid; v_pb uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if p_race_to is null or p_race_to < 1 or p_race_to > 9 then raise exception 'race_to_range'; end if;
  if v_handle = '' then raise exception 'opponent_required'; end if;

  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then raise exception 'no_player_for_account'; end if;

  select p.id into v_opp_player
  from players p join profiles pr on pr.id = p.user_id
  where pr.handle = v_handle;
  if v_opp_player is null then raise exception 'opponent_not_found'; end if;
  if v_opp_player = v_my_player then raise exception 'cannot_play_self'; end if;

  insert into matches (race_to, status, created_by)
  values (p_race_to, 'created', v_me) returning id into v_match;

  insert into match_participants (match_id, side, player_id) values (v_match, 'A', v_my_player)
    returning id into v_pa;
  insert into match_participants (match_id, side, player_id) values (v_match, 'B', v_opp_player)
    returning id into v_pb;

  insert into match_lineups (participant_id, player_id)
  values (v_pa, v_my_player), (v_pb, v_opp_player);

  return jsonb_build_object('match_id', v_match);
end $$;

-- ============ submit_lag ============
-- Records a side's lag; when both are in, ranks them (lower = closer to king wins;
-- '0.1'/'.1' = touching = best). Tie → clear both and re-lag. Winner sets first thrower
-- and spawns game 1. Caller must own that side (its player is this account) or be creator.
create or replace function submit_lag(p_match_id uuid, p_side text, p_value text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  m record; v_ok boolean;
  ra numeric; rb numeric; v_winner text;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if p_side not in ('A','B') then raise exception 'bad_side'; end if;
  if coalesce(btrim(p_value),'') = '' then raise exception 'lag_value_required'; end if;

  select * into m from matches where id = p_match_id;
  if not found then raise exception 'not_found'; end if;
  if m.status <> 'created' then raise exception 'not_in_lag'; end if;

  select exists (
    select 1 from match_participants mp join players p on p.id = mp.player_id
    where mp.match_id = p_match_id and mp.side = p_side and p.user_id = v_me
  ) or (m.created_by = v_me) into v_ok;
  if not v_ok then raise exception 'forbidden'; end if;

  if p_side = 'A' then
    update matches set lag_value_a = p_value where id = p_match_id;
  else
    update matches set lag_value_b = p_value where id = p_match_id;
  end if;

  select * into m from matches where id = p_match_id;   -- re-read both values
  if m.lag_value_a is null or m.lag_value_b is null then
    return jsonb_build_object('status', 'waiting');
  end if;

  -- rank: '0.1'/'.1' touching = 0.05 (best); otherwise numeric inches (98 not close, 99 king)
  ra := case when m.lag_value_a in ('0.1','.1') then 0.05 else m.lag_value_a::numeric end;
  rb := case when m.lag_value_b in ('0.1','.1') then 0.05 else m.lag_value_b::numeric end;

  if ra = rb then
    update matches set lag_value_a = null, lag_value_b = null where id = p_match_id;
    return jsonb_build_object('status', 'tie');
  end if;

  v_winner := case when ra < rb then 'A' else 'B' end;
  update matches set lag_winner_side = v_winner, status = 'live' where id = p_match_id;
  insert into games (match_id, game_number) values (p_match_id, 1);

  return jsonb_build_object('status', 'live', 'lag_winner_side', v_winner);
end $$;

-- ============ match_state ============
-- Client aggregator: match meta, per-side participants, games won (replayed), and the
-- current live game's id + state. Read-only. This is what the harness UI will render.
create or replace function match_state(p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m record;
  v_parts jsonb;
  g record; st jsonb;
  w_a int := 0; w_b int := 0;
  cur_game uuid; cur_state jsonb;
begin
  select * into m from matches where id = p_match_id;
  if not found then raise exception 'not_found'; end if;

  select jsonb_object_agg(mp.side, jsonb_build_object(
           'participant_id', mp.id,
           'player_id', mp.player_id,
           'team_id', mp.team_id,
           'display_name', pl.display_name,
           'user_id', pl.user_id))
    into v_parts
  from match_participants mp
  left join players pl on pl.id = mp.player_id
  where mp.match_id = p_match_id;

  for g in select id from games where match_id = p_match_id order by game_number loop
    st := game_state(g.id);
    if st->>'winner' = 'A' then w_a := w_a + 1;
    elsif st->>'winner' = 'B' then w_b := w_b + 1;
    else cur_game := g.id; cur_state := st;   -- the one unfinished game is current
    end if;
  end loop;

  return jsonb_build_object(
    'match_id', m.id,
    'race_to', m.race_to,
    'status', m.status,
    'lag', jsonb_build_object('winner_side', m.lag_winner_side, 'a', m.lag_value_a, 'b', m.lag_value_b),
    'participants', coalesce(v_parts, '{}'::jsonb),
    'games_won', jsonb_build_object('A', w_a, 'B', w_b),
    'current_game_id', cur_game,
    'current_state', cur_state);
end $$;

-- ============ grants ============
revoke all on function game_state(uuid)          from public;
revoke all on function create_match(int, text)   from public;
revoke all on function submit_lag(uuid, text, text) from public;
revoke all on function match_state(uuid)         from public;

grant execute on function game_state(uuid)          to authenticated;
grant execute on function create_match(int, text)   to authenticated;
grant execute on function submit_lag(uuid, text, text) to authenticated;
grant execute on function match_state(uuid)         to authenticated;
