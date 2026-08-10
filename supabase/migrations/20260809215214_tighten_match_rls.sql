-- Kubb Platform — Phase 3 (slice 2): tighten match-data RLS
-- Match tables were SELECT `using (true)` — any authenticated user could read every
-- match via the auto REST API. Scope reads to the match's creator + participants.
-- The app reads match data only through SECURITY DEFINER RPCs (match_state,
-- list_my_matches, player_profile, …), which bypass RLS — so this is transparent to
-- the app and closes direct PostgREST access.
--
-- profiles / players / teams stay publicly readable (public profiles + rosters/
-- leaderboards are intended). Private realtime broadcast is a later slice.
--
-- Apply with: supabase db push

-- Definer helpers: SECURITY DEFINER so reading matches/match_participants inside the
-- policy does NOT re-enter RLS (no recursion). auth.uid() still resolves to the caller.
create or replace function can_view_match(p_match_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from matches m where m.id = p_match_id and m.created_by = auth.uid())
      or exists (select 1 from match_participants mp join players p on p.id = mp.player_id
                 where mp.match_id = p_match_id and p.user_id = auth.uid());
$$;

create or replace function can_view_game(p_game_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_view_match((select match_id from games where id = p_game_id));
$$;

create or replace function can_view_participant(p_participant_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_view_match((select match_id from match_participants where id = p_participant_id));
$$;

revoke all on function can_view_match(uuid) from public;
revoke all on function can_view_game(uuid) from public;
revoke all on function can_view_participant(uuid) from public;
grant execute on function can_view_match(uuid) to authenticated;
grant execute on function can_view_game(uuid) to authenticated;
grant execute on function can_view_participant(uuid) to authenticated;

-- Replace the open SELECT policies with participant/creator scope.
drop policy if exists matches_select on matches;
create policy matches_select on matches for select to authenticated
  using (can_view_match(id));

drop policy if exists participants_select on match_participants;
create policy participants_select on match_participants for select to authenticated
  using (can_view_match(match_id));

drop policy if exists games_select on games;
create policy games_select on games for select to authenticated
  using (can_view_match(match_id));

drop policy if exists turns_select on turns;
create policy turns_select on turns for select to authenticated
  using (can_view_game(game_id));

drop policy if exists lineups_select on match_lineups;
create policy lineups_select on match_lineups for select to authenticated
  using (can_view_participant(participant_id));
