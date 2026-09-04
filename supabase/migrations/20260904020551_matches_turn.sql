-- Kubb Platform — expose whose turn it is in list_my_matches
--   The Matches/Dashboard UI splits active matches into "Your Turn" vs
--   "Waiting for opponent", which needs a per-match turn signal the list RPC didn't
--   carry. We redefine list_my_matches() (redefine-in-new-migration pattern) to add a
--   derived `turn` field: 'you' | 'opponent' | null.
--
--   turn is null for finished/abandoned matches and for rows where the caller isn't a
--   participant (created-only spectator). For active matches:
--     - managed opponent (opponent has no account) → 'you' (caller scores both sides)
--     - live  → compare the current game's next_side to the caller's side
--     - created (lag) → 'you' until the caller's lag value is set, else 'opponent'
--       (submit_lag flips status to 'live' once both lags are in, so "both set" never
--        persists in the created state)
--
-- Apply with: supabase db push  (or paste into the Supabase SQL editor)

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
      'games_won', gw, 'result', res, 'turn', v_turn);
  end loop;
  return arr;
end $$;

revoke all on function list_my_matches() from public;
grant execute on function list_my_matches() to authenticated;
