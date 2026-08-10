-- Kubb Platform — Phase 3 (slice 1): history & profiles
-- Additive read RPCs (SECURITY DEFINER, authed). No engine/schema changes.
--   match_games_won(match)  → {A,B}                 reusable per-match score
--   player_profile(handle)  → { player, record, matches }
--   list_my_matches()       → now includes games_won, result, opponent_handle
--   match_state()           → participants now include `handle` (for profile links)
--
-- Apply with: supabase db push

-- ============ match_games_won ============
create or replace function match_games_won(p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g record; w_a int := 0; w_b int := 0; win text;
begin
  for g in select id from games where match_id = p_match_id loop
    win := game_state(g.id)->>'winner';
    if win = 'A' then w_a := w_a + 1; elsif win = 'B' then w_b := w_b + 1; end if;
  end loop;
  return jsonb_build_object('A', w_a, 'B', w_b);
end $$;

-- ============ list_my_matches (now with score + result + opponent handle) ============
create or replace function list_my_matches() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  arr jsonb := '[]'::jsonb;
  m record; gw jsonb; my text; other text; opp_name text; opp_handle text; res text;
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
    if m.status = 'finished' and my is not null then
      other := case when my = 'A' then 'B' else 'A' end;
      res := case when (gw->>my)::int > (gw->>other)::int then 'won' else 'lost' end;
    end if;

    arr := arr || jsonb_build_object(
      'match_id', m.id, 'status', m.status, 'race_to', m.race_to, 'created_at', m.created_at,
      'my_side', my, 'opponent', opp_name, 'opponent_handle', opp_handle,
      'games_won', gw, 'result', res);
  end loop;
  return arr;
end $$;

-- ============ player_profile ============
create or replace function player_profile(p_handle citext) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_pid uuid; v_user uuid; prof record;
  arr jsonb := '[]'::jsonb;
  m record; gw jsonb; my text; other text; opp_name text; opp_handle text; res text;
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
    if m.status = 'finished' and my is not null then
      other := case when my = 'A' then 'B' else 'A' end;
      res := case when (gw->>my)::int > (gw->>other)::int then 'won' else 'lost' end;
      if res = 'won' then wins := wins + 1; else losses := losses + 1; end if;
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

-- ============ match_state (+ participant handle) ============
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
    'undo_target', v_undo);
end $$;

-- ============ grants ============
revoke all on function match_games_won(uuid) from public;
revoke all on function player_profile(citext) from public;
grant execute on function match_games_won(uuid) to authenticated;
grant execute on function player_profile(citext) to authenticated;
