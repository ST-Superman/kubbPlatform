-- Kubb Platform — Bot opponents (simulated matches) · Phase 7: SIM badges + record toggle
--   1. Expose is_simulated on the match-list rows (list_my_matches, player_profile) so the UI
--      can badge bot matches as "SIM".
--   2. A record-exclusion toggle: platform_config.record_excludes_sims (default FALSE = bot
--      matches count in your W/L record, per the current decision). When flipped TRUE later,
--      player_profile stops counting sim matches toward wins/losses — but STILL lists them
--      (badged). Deliberately scoped to the record only: player_stats (throwing metrics +
--      the clone unlock gate) stays always-inclusive, so flipping this never silently
--      re-locks a Clone or rewrites skill metrics.
--
--   Redefines list_my_matches (latest: 20260904020551) and player_profile (latest:
--   20260810000300) verbatim + the additions. Apply by pasting into the Supabase SQL editor.

-- ============ record-exclusion toggle (off by default) ============
alter table platform_config add column if not exists record_excludes_sims boolean not null default false;

-- ============ list_my_matches (+ is_simulated) ============
create or replace function list_my_matches() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  arr jsonb := '[]'::jsonb;
  m record; gw jsonb; my text; opp_name text; opp_handle text; opp_user uuid;
  res text; w text; v_turn text; v_next text; v_mylag text;
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

    select pl.display_name, pr.handle::text, pl.user_id into opp_name, opp_handle, opp_user
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

    -- whose turn: only meaningful for a participant in an active match
    v_turn := null;
    if my is not null and m.status in ('created', 'live') then
      if opp_user is null then
        v_turn := 'you';                         -- managed opponent: caller scores both sides
      elsif m.status = 'live' then
        select q.s->>'next_side' into v_next
        from (select game_state(g.id) as s, g.game_number
              from games g where g.match_id = m.id) q
        where (q.s->>'winner') is null
        order by q.game_number limit 1;
        if v_next is not null then
          v_turn := case when v_next = my then 'you' else 'opponent' end;
        end if;
      else
        v_mylag := case when my = 'A' then m.lag_value_a else m.lag_value_b end;
        v_turn := case when v_mylag is null then 'you' else 'opponent' end;
      end if;
    end if;

    arr := arr || jsonb_build_object(
      'match_id', m.id, 'status', m.status, 'race_to', m.race_to, 'created_at', m.created_at,
      'my_side', my, 'opponent', opp_name, 'opponent_handle', opp_handle,
      'games_won', gw, 'result', res, 'turn', v_turn, 'is_simulated', m.is_simulated);
  end loop;
  return arr;
end $$;

revoke all on function list_my_matches() from public;
grant execute on function list_my_matches() to authenticated;

-- ============ player_profile (+ is_simulated rows, + record toggle) ============
create or replace function player_profile(p_handle citext) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_pid uuid; v_user uuid; prof record;
  arr jsonb := '[]'::jsonb;
  m record; gw jsonb; my text; opp_name text; opp_handle text; res text; w text;
  wins int := 0; losses int := 0;
  v_excl boolean := false;
begin
  select p.id, p.user_id into v_pid, v_user
  from players p join profiles pr on pr.id = p.user_id
  where pr.handle = p_handle;
  if v_pid is null then return null; end if;

  select coalesce(record_excludes_sims, false) into v_excl from platform_config limit 1;

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
        -- record counts sim matches unless the toggle excludes them (still listed below).
        if not (v_excl and coalesce(m.is_simulated, false)) then
          if res = 'won' then wins := wins + 1; else losses := losses + 1; end if;
        end if;
      end if;
    end if;

    arr := arr || jsonb_build_object(
      'match_id', m.id, 'status', m.status, 'race_to', m.race_to, 'created_at', m.created_at,
      'my_side', my, 'opponent', opp_name, 'opponent_handle', opp_handle,
      'games_won', gw, 'result', res, 'is_simulated', m.is_simulated);
  end loop;

  return jsonb_build_object(
    'player', jsonb_build_object(
      'id', v_pid, 'user_id', v_user, 'handle', prof.handle,
      'display_name', prof.display_name, 'avatar_url', prof.avatar_url, 'created_at', prof.created_at),
    'record', jsonb_build_object('wins', wins, 'losses', losses),
    'matches', arr);
end $$;

revoke all on function player_profile(citext) from public;
grant execute on function player_profile(citext) to authenticated;
