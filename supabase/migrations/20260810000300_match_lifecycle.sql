-- Kubb Platform — Phase 3 (slice 4): match lifecycle (abandon / forfeit / delete)
-- Adds the human endings and hardens writes against ended matches. Forfeit records an
-- explicit winner that overrides the derived one; a match_winner() helper centralizes
-- "who won" so match_state / list_my_matches / player_profile all agree.
--
-- Apply with: supabase db push

alter table matches add column if not exists winner_side text check (winner_side in ('A','B'));

-- ============ match_winner: effective winner side (override or derived), null unless finished ============
create or replace function match_winner(p_match_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare m record; gw jsonb;
begin
  select status, winner_side into m from matches where id = p_match_id;
  if not found or m.status <> 'finished' then return null; end if;
  if m.winner_side is not null then return m.winner_side; end if;
  gw := match_games_won(p_match_id);
  return case
    when (gw->>'A')::int > (gw->>'B')::int then 'A'
    when (gw->>'B')::int > (gw->>'A')::int then 'B'
    else null end;
end $$;

-- ============ abandon_match: stop a created/live match, no winner ============
create or replace function abandon_match(p_match_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if not (can_act(p_match_id, 'A') or can_act(p_match_id, 'B')) then raise exception 'forbidden'; end if;
  select status into m from matches where id = p_match_id;
  if not found then raise exception 'not_found'; end if;
  if m.status not in ('created', 'live') then raise exception 'not_active'; end if;
  update matches set status = 'abandoned' where id = p_match_id;
  return match_state(p_match_id);
end $$;

-- ============ forfeit_match: caller concedes their side; opponent wins ============
create or replace function forfeit_match(p_match_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m record; v_side text;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  select status into m from matches where id = p_match_id;
  if not found then raise exception 'not_found'; end if;
  if m.status not in ('created', 'live') then raise exception 'not_active'; end if;
  select mp.side into v_side
  from match_participants mp join players p on p.id = mp.player_id
  where mp.match_id = p_match_id and p.user_id = auth.uid()
  limit 1;
  if v_side is null then raise exception 'forbidden'; end if;
  update matches
     set winner_side = case when v_side = 'A' then 'B' else 'A' end, status = 'finished'
   where id = p_match_id;
  return match_state(p_match_id);
end $$;

-- ============ delete_match: creator removes a pre-lag mistake ============
create or replace function delete_match(p_match_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  select created_by, status into m from matches where id = p_match_id;
  if not found then raise exception 'not_found'; end if;
  if m.created_by <> auth.uid() then raise exception 'forbidden'; end if;
  if m.status <> 'created' then raise exception 'not_deletable'; end if;
  delete from matches where id = p_match_id;  -- FKs cascade participants/lineups/games/turns/tokens
  return jsonb_build_object('deleted', true);
end $$;

-- ============ submit_turn: require the match to be live (blocks abandoned/forfeited/finished) ============
create or replace function submit_turn(
  p_turn_id uuid,
  p_game_id uuid,
  p_token uuid,
  p_expected_seq int,
  p_batons_field int, p_batons_baseline int, p_baseline_kubbs int,
  p_base_kubb_double boolean, p_penalty_kubbs int, p_field_kubbs_left int,
  p_advantage_line text, p_king_shots int,
  p_king_hit boolean, p_king_hit_early boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_match uuid; s jsonb; x text; o text; participant uuid;
  cap int; used int; field_x int; base_o int; adv_x text;
  bl_total int; felled_field int; fin boolean;
  v_race_to int; w_a int := 0; w_b int := 0; g record; gs jsonb; v_gnum int;
begin
  select match_id into v_match from games where id = p_game_id;
  if v_match is null then raise exception 'game_not_found'; end if;

  -- 0. idempotency
  if exists (select 1 from turns where id = p_turn_id) then
    return match_state(v_match) || jsonb_build_object('duplicate', true);
  end if;

  -- match must be live to accept a new turn (forfeit/abandon set a terminal status)
  if (select status from matches where id = v_match) <> 'live' then
    raise exception 'match_not_live';
  end if;

  s := game_state(p_game_id);
  if s->>'winner' is not null then raise exception 'game_over'; end if;
  x := s->>'next_side';
  o := case when x = 'A' then 'B' else 'A' end;

  -- 1. authz
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if not can_act(v_match, x) then raise exception 'forbidden'; end if;

  select id into participant from match_participants where match_id = v_match and side = x;

  -- 2. concurrency
  if p_expected_seq is distinct from
     (select coalesce(max(seq),0)+1 from turns where game_id = p_game_id and voided_at is null)
  then return match_state(v_match) || jsonb_build_object('already_scored', true); end if;

  -- 3. VALIDATION — mirrors buildErrors() (same order, same rules) + range guards
  cap := (s->>'round_cap')::int;
  used := p_batons_field + p_batons_baseline + p_king_shots;
  field_x := (s->'field'->>x)::int;
  base_o  := (s->'baseline'->>o)::int;
  adv_x   := s->'advantage'->>x;
  bl_total := p_baseline_kubbs + p_base_kubb_double::int;
  felled_field := field_x - p_field_kubbs_left;

  if used > cap then raise exception 'batons_over_cap'; end if;
  if used = 0 and not p_king_hit_early then raise exception 'no_batons'; end if;
  if p_batons_field = 0 and felled_field > 0 then raise exception 'field_batons_missing'; end if;
  if p_field_kubbs_left < 0 or p_field_kubbs_left > field_x then raise exception 'field_left_range'; end if;
  if p_field_kubbs_left > 0 and (p_batons_baseline > 0 or p_baseline_kubbs > 0
     or p_base_kubb_double or p_king_shots > 0 or p_king_hit)
    then raise exception 'field_blocks_baseline'; end if;
  if p_field_kubbs_left > 0 and p_advantage_line is null then raise exception 'advantage_line_required'; end if;
  if p_base_kubb_double and field_x = 0 then raise exception 'double_needs_field'; end if;
  if p_baseline_kubbs > p_batons_baseline then raise exception 'hits_exceed_batons'; end if;
  if bl_total > base_o then raise exception 'baseline_over_remaining'; end if;
  if base_o = 0 and p_batons_baseline > 0 then raise exception 'baseline_clear_use_king_shots'; end if;
  if p_penalty_kubbs < 0 or p_penalty_kubbs > field_x then raise exception 'penalty_range'; end if;
  if p_king_shots > 0 and not (base_o - bl_total = 0 and p_field_kubbs_left = 0)
    then raise exception 'king_too_early_range'; end if;
  if p_king_hit and p_king_shots = 0 then raise exception 'king_hit_needs_shot'; end if;
  if p_king_hit and p_king_hit_early then raise exception 'king_flags_conflict'; end if;

  fin := p_king_hit or p_king_hit_early;

  -- 4. append
  insert into turns (id, game_id, participant_id, seq, batons_field, batons_baseline,
    throw_line, baseline_kubbs, base_kubb_double, penalty_kubbs, field_kubbs_left,
    advantage_line, king_shots, king_hit, king_hit_early, finished)
  values (p_turn_id, p_game_id, participant, p_expected_seq, p_batons_field, p_batons_baseline,
    case when adv_x is not null then 'advantage' else '8m' end,
    p_baseline_kubbs, p_base_kubb_double, p_penalty_kubbs, p_field_kubbs_left,
    case when p_field_kubbs_left > 0 then p_advantage_line end,
    p_king_shots, p_king_hit, p_king_hit_early, fin);

  -- 5. game end → finish match (race-to-N) or spawn the next game
  if fin then
    for g in select id from games where match_id = v_match loop
      gs := game_state(g.id);
      if gs->>'winner' = 'A' then w_a := w_a + 1;
      elsif gs->>'winner' = 'B' then w_b := w_b + 1; end if;
    end loop;
    select race_to into v_race_to from matches where id = v_match;
    if w_a >= v_race_to or w_b >= v_race_to then
      update matches set status = 'finished' where id = v_match;
    else
      select coalesce(max(game_number),0)+1 into v_gnum from games where match_id = v_match;
      insert into games (match_id, game_number) values (v_match, v_gnum);
    end if;
  end if;

  return match_state(v_match);
end $$;

-- ============ rewind_to: refuse when the match was conceded or abandoned ============
create or replace function rewind_to(p_game_id uuid, p_seq int, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_match uuid; v_gnum int; v_race_to int;
  w_a int := 0; w_b int := 0; g record; gs jsonb;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;

  select match_id, game_number into v_match, v_gnum from games where id = p_game_id;
  if v_match is null then raise exception 'game_not_found'; end if;

  if not (can_act(v_match, 'A') or can_act(v_match, 'B')) then raise exception 'forbidden'; end if;

  if exists (select 1 from matches where id = v_match and (status = 'abandoned' or winner_side is not null)) then
    raise exception 'cannot_rewind';
  end if;

  update turns set voided_at = now()
   where game_id = p_game_id and seq >= p_seq and voided_at is null;

  delete from games gx
   where gx.match_id = v_match and gx.game_number > v_gnum
     and not exists (select 1 from turns t where t.game_id = gx.id and t.voided_at is null);

  for g in select id from games where match_id = v_match loop
    gs := game_state(g.id);
    if gs->>'winner' = 'A' then w_a := w_a + 1;
    elsif gs->>'winner' = 'B' then w_b := w_b + 1; end if;
  end loop;
  select race_to into v_race_to from matches where id = v_match;
  update matches
     set status = case when w_a >= v_race_to or w_b >= v_race_to then 'finished' else 'live' end
   where id = v_match and status <> 'abandoned';

  return match_state(v_match);
end $$;

-- ============ match_state (+ winner_side + by_forfeit) ============
create or replace function match_state(p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m record;
  v_parts jsonb;
  g record; st jsonb;
  w_a int := 0; w_b int := 0;
  cur_game uuid; cur_state jsonb; v_undo jsonb;
  v_games jsonb; v_last_game uuid; v_turns jsonb;
begin
  select * into m from matches where id = p_match_id;
  if not found then raise exception 'not_found'; end if;

  select jsonb_object_agg(mp.side, jsonb_build_object(
           'participant_id', mp.id,
           'player_id', mp.player_id,
           'team_id', mp.team_id,
           'display_name', pl.display_name,
           'user_id', pl.user_id,
           'handle', pr.handle::text))
    into v_parts
  from match_participants mp
  left join players pl on pl.id = mp.player_id
  left join profiles pr on pr.id = pl.user_id
  where mp.match_id = p_match_id;

  for g in select id from games where match_id = p_match_id order by game_number loop
    st := game_state(g.id);
    if st->>'winner' = 'A' then w_a := w_a + 1;
    elsif st->>'winner' = 'B' then w_b := w_b + 1;
    else cur_game := g.id; cur_state := st;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'game_number', gg.game_number,
           'winner', game_state(gg.id)->>'winner') order by gg.game_number), '[]'::jsonb)
    into v_games
  from games gg where gg.match_id = p_match_id;

  select id into v_last_game from games where match_id = p_match_id
  order by game_number desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'seq', t.seq,
           'side', mp.side,
           'voided', (t.voided_at is not null),
           'batons_field', t.batons_field,
           'batons_baseline', t.batons_baseline,
           'baseline_kubbs', t.baseline_kubbs,
           'base_kubb_double', t.base_kubb_double,
           'penalty_kubbs', t.penalty_kubbs,
           'field_kubbs_left', t.field_kubbs_left,
           'advantage_line', t.advantage_line,
           'king_shots', t.king_shots,
           'king_hit', t.king_hit,
           'king_hit_early', t.king_hit_early,
           'throw_line', t.throw_line) order by t.seq), '[]'::jsonb)
    into v_turns
  from turns t
  join match_participants mp on mp.id = t.participant_id
  where t.game_id = v_last_game;

  select jsonb_build_object('game_id', t.game_id, 'seq', t.seq)
    into v_undo
  from turns t join games g2 on g2.id = t.game_id
  where g2.match_id = p_match_id and t.voided_at is null
  order by g2.game_number desc, t.seq desc
  limit 1;

  return jsonb_build_object(
    'match_id', m.id,
    'race_to', m.race_to,
    'status', m.status,
    'lag', jsonb_build_object('winner_side', m.lag_winner_side, 'a', m.lag_value_a, 'b', m.lag_value_b),
    'participants', coalesce(v_parts, '{}'::jsonb),
    'games_won', jsonb_build_object('A', w_a, 'B', w_b),
    'games', v_games,
    'current_game_id', cur_game,
    'current_state', cur_state,
    'current_turns', v_turns,
    'last_game_id', v_last_game,
    'next_seq', (cur_state->>'seq')::int,
    'undo_target', v_undo,
    'winner_side', match_winner(m.id),
    'by_forfeit', (m.winner_side is not null));
end $$;

-- ============ list_my_matches (result via match_winner, so forfeits count) ============
create or replace function list_my_matches() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  arr jsonb := '[]'::jsonb;
  m record; gw jsonb; my text; opp_name text; opp_handle text; res text; w text;
begin
  for m in
    select mm.* from matches mm
    where mm.created_by = v_me
       or exists (select 1 from match_participants mp join players p on p.id = mp.player_id
                  where mp.match_id = mm.id and p.user_id = v_me)
    order by mm.created_at desc
  loop
    select mp.side into my
    from match_participants mp join players p on p.id = mp.player_id
    where mp.match_id = m.id and p.user_id = v_me limit 1;

    select pl.display_name, pr.handle::text into opp_name, opp_handle
    from match_participants mp2
    join players pl on pl.id = mp2.player_id
    left join profiles pr on pr.id = pl.user_id
    where mp2.match_id = m.id and pl.user_id is distinct from v_me limit 1;

    gw := match_games_won(m.id);
    res := null;
    if my is not null then
      w := match_winner(m.id);
      if w is not null then res := case when w = my then 'won' else 'lost' end; end if;
    end if;

    arr := arr || jsonb_build_object(
      'match_id', m.id, 'status', m.status, 'race_to', m.race_to, 'created_at', m.created_at,
      'my_side', my, 'opponent', opp_name, 'opponent_handle', opp_handle,
      'games_won', gw, 'result', res);
  end loop;
  return arr;
end $$;

-- ============ player_profile (result + record via match_winner) ============
create or replace function player_profile(p_handle citext) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_pid uuid; v_user uuid; prof record;
  arr jsonb := '[]'::jsonb;
  m record; gw jsonb; my text; opp_name text; opp_handle text; res text; w text;
  wins int := 0; losses int := 0;
begin
  select p.id, p.user_id into v_pid, v_user
  from players p join profiles pr on pr.id = p.user_id
  where pr.handle = p_handle;
  if v_pid is null then return null; end if;

  select pr.handle::text as handle, pr.display_name, pr.avatar_url, pr.created_at
    into prof
  from profiles pr where pr.id = v_user;

  for m in
    select mm.* from matches mm
    where exists (select 1 from match_participants mp where mp.match_id = mm.id and mp.player_id = v_pid)
    order by mm.created_at desc
  loop
    select mp.side into my from match_participants mp
    where mp.match_id = m.id and mp.player_id = v_pid limit 1;

    select pl.display_name, pr.handle::text into opp_name, opp_handle
    from match_participants mp2
    join players pl on pl.id = mp2.player_id
    left join profiles pr on pr.id = pl.user_id
    where mp2.match_id = m.id and mp2.player_id is distinct from v_pid limit 1;

    gw := match_games_won(m.id);
    res := null;
    if my is not null then
      w := match_winner(m.id);
      if w is not null then
        res := case when w = my then 'won' else 'lost' end;
        if res = 'won' then wins := wins + 1; else losses := losses + 1; end if;
      end if;
    end if;

    arr := arr || jsonb_build_object(
      'match_id', m.id, 'status', m.status, 'race_to', m.race_to, 'created_at', m.created_at,
      'my_side', my, 'opponent', opp_name, 'opponent_handle', opp_handle,
      'games_won', gw, 'result', res);
  end loop;

  return jsonb_build_object(
    'player', jsonb_build_object(
      'id', v_pid, 'user_id', v_user, 'handle', prof.handle,
      'display_name', prof.display_name, 'avatar_url', prof.avatar_url, 'created_at', prof.created_at),
    'record', jsonb_build_object('wins', wins, 'losses', losses),
    'matches', arr);
end $$;

-- ============ grants ============
revoke all on function match_winner(uuid)   from public;
revoke all on function abandon_match(uuid)   from public;
revoke all on function forfeit_match(uuid)   from public;
revoke all on function delete_match(uuid)    from public;
grant execute on function match_winner(uuid) to anon, authenticated;
grant execute on function abandon_match(uuid) to authenticated;
grant execute on function forfeit_match(uuid) to authenticated;
grant execute on function delete_match(uuid)  to authenticated;
