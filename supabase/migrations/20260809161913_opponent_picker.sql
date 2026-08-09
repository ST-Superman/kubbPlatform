-- Kubb Platform — Phase 2: opponent picker
-- The harness create-match form asked for an opponent @handle, but a solo tester has
-- no other accounts to name. Switch create_match to take an opponent player_id and add
-- list_opponents() so the UI offers a searchable list: other real accounts PLUS the
-- caller's own managed players (which are perfectly valid opponents — as match creator
-- you can score both sides, the solo two-tab test).
--
-- Apply with: supabase db push

-- ============ list_opponents ============
create or replace function list_opponents() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row order by row->>'display_name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'player_id', p.id,
      'display_name', p.display_name,
      'handle', pr.handle::text,
      'kind', case when p.user_id is not null then 'account' else 'managed' end
    ) as row
    from players p
    left join profiles pr on pr.id = p.user_id
    where (p.user_id is not null and p.user_id <> auth.uid())   -- other real accounts
       or (p.user_id is null and p.created_by = auth.uid())      -- my managed players
  ) sub;
$$;

revoke all on function list_opponents() from public;
grant execute on function list_opponents() to authenticated;

-- ============ create_match (now by opponent player_id) ============
drop function if exists create_match(int, text);

create or replace function create_match(p_race_to int, p_opponent_player_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_my_player uuid; v_match uuid; v_pa uuid; v_pb uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if p_race_to is null or p_race_to < 1 or p_race_to > 9 then raise exception 'race_to_range'; end if;
  if p_opponent_player_id is null then raise exception 'opponent_required'; end if;

  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then raise exception 'no_player_for_account'; end if;
  if not exists (select 1 from players where id = p_opponent_player_id) then
    raise exception 'opponent_not_found';
  end if;
  if p_opponent_player_id = v_my_player then raise exception 'cannot_play_self'; end if;

  insert into matches (race_to, status, created_by)
  values (p_race_to, 'created', v_me) returning id into v_match;

  insert into match_participants (match_id, side, player_id) values (v_match, 'A', v_my_player)
    returning id into v_pa;
  insert into match_participants (match_id, side, player_id) values (v_match, 'B', p_opponent_player_id)
    returning id into v_pb;

  insert into match_lineups (participant_id, player_id)
  values (v_pa, v_my_player), (v_pb, p_opponent_player_id);

  return jsonb_build_object('match_id', v_match);
end $$;

revoke all on function create_match(int, uuid) from public;
grant execute on function create_match(int, uuid) to authenticated;
