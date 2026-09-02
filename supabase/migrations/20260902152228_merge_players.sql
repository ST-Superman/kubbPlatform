-- Kubb Platform — Reusable player merge
--   Folds one player row (loser) into another (winner): reassigns ALL history and
--   references, then deletes the loser. This is the recurring "a managed player signed
--   up fresh instead of claiming, so now there are two rows" fix, done safely in one call.
--
--   The mechanical merge lives in _merge_player_rows() so both the admin path
--   (merge_players) and the claim path (claim_player, separate migration) share ONE
--   implementation and can never drift.
--
--   References covered (the complete set that points at players.id):
--     match_participants.player_id     (RESTRICT)  — reassign
--     match_lineups.player_id          (PK w/ participant, RESTRICT) — dedupe + reassign
--     team_members.player_id           (PK w/ team, CASCADE) — dedupe + reassign
--     challenges.from_player/to_player (CASCADE) — drop head-to-head + pending-dupes, reassign
--     player_claims.player_id          (CASCADE) — removed with the loser row
--   Not touched: profiles / memberships (keyed by auth user, not player).
--
-- Apply with: supabase db push

-- ============ _merge_player_rows: mechanical merge (internal) ============
-- Purely mechanical: moves references loser → winner and deletes the loser row.
-- Does NOT change the winner's user_id / claimed_at / display_name — the caller owns
-- identity decisions (claim_player sets user_id after; merge_players leaves it alone).
-- Assumes no unique(match_id, player_id) on match_participants (verified: none), so the
-- straight reassign there can't collide.
create or replace function _merge_player_rows(p_winner uuid, p_loser uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_parts      int;
  v_lineups    int;
  v_teams      int;
  v_challenges int;
begin
  -- Count-before, for the audit return value.
  select count(*) into v_parts      from match_participants where player_id = p_loser;
  select count(*) into v_lineups    from match_lineups      where player_id = p_loser;
  select count(*) into v_teams      from team_members       where player_id = p_loser;
  select count(*) into v_challenges from challenges
    where from_player = p_loser or to_player = p_loser;

  -- match_participants: straight reassign (no unique(match_id,player_id)).
  update match_participants set player_id = p_winner where player_id = p_loser;

  -- match_lineups (PK participant_id, player_id): drop rows that would collide, then move.
  delete from match_lineups ml
   where ml.player_id = p_loser
     and exists (select 1 from match_lineups w
                 where w.participant_id = ml.participant_id and w.player_id = p_winner);
  update match_lineups set player_id = p_winner where player_id = p_loser;

  -- team_members (PK team_id, player_id): drop duplicate memberships, then move.
  delete from team_members tm
   where tm.player_id = p_loser
     and exists (select 1 from team_members w
                 where w.team_id = tm.team_id and w.player_id = p_winner);
  update team_members set player_id = p_winner where player_id = p_loser;

  -- challenges: remove head-to-head (would violate check from_player<>to_player)...
  delete from challenges
   where (from_player = p_loser  and to_player = p_winner)
      or (from_player = p_winner and to_player = p_loser);
  -- ...and remove pending-dupes that would collide with the partial unique index on
  -- (from_player, to_player) where status='pending', in either direction...
  delete from challenges c
   where c.status = 'pending' and c.from_player = p_loser
     and exists (select 1 from challenges w
                 where w.status = 'pending' and w.from_player = p_winner
                   and w.to_player = c.to_player);
  delete from challenges c
   where c.status = 'pending' and c.to_player = p_loser
     and exists (select 1 from challenges w
                 where w.status = 'pending' and w.to_player = p_winner
                   and w.from_player = c.from_player);
  -- ...then reassign the rest.
  update challenges set from_player = p_winner where from_player = p_loser;
  update challenges set to_player   = p_winner where to_player   = p_loser;

  -- Delete the loser row; its player_claims row cascades away with it.
  delete from players where id = p_loser;

  return jsonb_build_object(
    'winner',                 p_winner,
    'loser',                  p_loser,
    'participations_moved',   v_parts,
    'lineups_moved',          v_lineups,
    'team_memberships_moved', v_teams,
    'challenge_rows_touched', v_challenges);
end $$;

revoke all on function _merge_player_rows(uuid, uuid) from public;
-- No grants: internal-only, called from other SECURITY DEFINER functions.

-- ============ merge_players: admin entry point (service role) ============
-- Fold p_loser into p_winner. The winner survives with all history; the loser is deleted.
-- Guard: refuses to delete a loser that's tied to a real account (that would orphan the
-- auth.users row) unless p_allow_account_loss => true is passed explicitly.
create or replace function merge_players(
  p_winner uuid,
  p_loser  uuid,
  p_allow_account_loss boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w players;
  l players;
begin
  if p_winner = p_loser then raise exception 'winner_equals_loser'; end if;

  select * into w from players where id = p_winner;
  if not found then raise exception 'winner_not_found: %', p_winner; end if;
  select * into l from players where id = p_loser;
  if not found then raise exception 'loser_not_found: %', p_loser; end if;

  -- Deleting a loser linked to a real account leaves that account with no player row.
  -- Require explicit opt-in for that case (the common case — a managed loser — has NULL).
  if l.user_id is not null and not p_allow_account_loss then
    raise exception
      'loser_has_account: loser % is linked to auth user %. Pass p_allow_account_loss => true to proceed anyway.',
      p_loser, l.user_id;
  end if;

  return _merge_player_rows(p_winner, p_loser);
end $$;

revoke all on function merge_players(uuid, uuid, boolean)   from public;
grant execute on function merge_players(uuid, uuid, boolean) to service_role;
