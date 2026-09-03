-- Kubb Platform — admin_delete_user: remove a login, preserve the competitive record
--   Policy (product decision 2026-09-02): delete the auth account but KEEP history.
--     • Deletes auth.users → cascades profiles, memberships, membership_purchases,
--       coupon_redemptions.
--     • ORPHANS the user's own player row: kept with all match history, unowned
--       (user_id + created_by nulled), reclaimable later via merge_players().
--     • DETACHES managed players they created for others (created_by → null; those
--       profiles + claim links stay intact and claimable).
--     • REASSIGNS content they created (matches, teams — both created_by NOT NULL) to
--       p_reassign_to, so the history keeps a valid owner instead of being deleted.
--
--   Why a function (not the dashboard): players.created_by / teams.created_by /
--   matches.created_by are RESTRICT references to auth.users, and every user's own player
--   row has created_by = self — so a plain delete (dashboard included) fails the FK. This
--   clears every blocker in order, then deletes.
--
--   service_role only. Run from the SQL editor (owned by postgres, which can delete auth.users).
--
-- Apply with: supabase db push

create or replace function admin_delete_user(p_uid uuid, p_reassign_to uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_self            uuid;
  v_managed         int := 0;
  v_matches         int;
  v_teams           int;
  v_participations  int := 0;
begin
  if not exists (select 1 from auth.users where id = p_uid) then
    raise exception 'user_not_found: %', p_uid;
  end if;

  select count(*) into v_matches from matches where created_by = p_uid;
  select count(*) into v_teams   from teams   where created_by = p_uid;

  -- Matches/teams have created_by NOT NULL, and we're KEEPING history → ownership must be
  -- transferred, not nulled. Require a target only when there's something to move.
  if (v_matches > 0 or v_teams > 0) then
    if p_reassign_to is null then
      raise exception
        'reassign_target_required: user created % match(es) and % team(s); pass p_reassign_to => ''<admin-user-id>'' to transfer ownership (history is preserved).',
        v_matches, v_teams;
    end if;
    if not exists (select 1 from auth.users where id = p_reassign_to) then
      raise exception 'reassign_target_not_found: %', p_reassign_to;
    end if;
    if p_reassign_to = p_uid then
      raise exception 'reassign_target_is_self';
    end if;
    update matches set created_by = p_reassign_to where created_by = p_uid;
    update teams   set created_by = p_reassign_to where created_by = p_uid;
  end if;

  -- Detach managed players this user created for OTHERS (keep them claimable).
  -- players.user_id is UNIQUE, so the only created_by = p_uid row with user_id = p_uid is the
  -- user's own self-row; everything else caught here is a managed profile.
  update players set created_by = null
   where created_by = p_uid and user_id is distinct from p_uid;
  get diagnostics v_managed = row_count;

  -- Orphan the user's OWN player row: keep it + history, clear both auth.users references.
  -- (user_id would SET NULL on delete anyway; created_by = self is RESTRICT and must be cleared.)
  select id into v_self from players where user_id = p_uid;
  if v_self is not null then
    select count(*) into v_participations from match_participants where player_id = v_self;
    update players set user_id = null, created_by = null where id = v_self;
  end if;

  -- All auth.users references to p_uid are now cleared → the delete succeeds.
  -- Cascades: profiles, memberships, membership_purchases, coupon_redemptions.
  delete from auth.users where id = p_uid;

  return jsonb_build_object(
    'deleted_user',             p_uid,
    'orphaned_player',          v_self,               -- null if the user had no player row
    'player_participations',    v_participations,     -- history kept on the orphan
    'managed_players_detached', v_managed,
    'matches_reassigned',       v_matches,
    'teams_reassigned',         v_teams,
    'reassigned_to',            p_reassign_to);
end $$;

revoke all on function admin_delete_user(uuid, uuid)   from public;
grant execute on function admin_delete_user(uuid, uuid) to service_role;
