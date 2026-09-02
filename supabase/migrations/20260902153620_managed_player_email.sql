-- Kubb Platform — Managed-player email capture + email-match claim (+ claim_player fix)
--   Reduces duplicate profiles at the source: an organizer can attach a contact email to a
--   managed player; at onboarding we match a new signup's email to an unclaimed managed
--   profile and offer a one-tap claim. Both the token path and the email path converge on
--   ONE internal binder (_claim_managed_player), which uses _merge_player_rows so history is
--   folded in safely.
--
--   Depends on: 20260902152228_merge_players.sql (_merge_player_rows). Apply that first.
--
-- Apply with: supabase db push

-- ============ contact email on the (private) claim record ============
-- Stored on player_claims, NOT players: player_claims has no select policy, so the email
-- can never leak through PostgREST. players has public-read RLS and would expose it.
alter table player_claims add column if not exists contact_email citext;

-- ============ create_managed_player: now accepts an optional contact email ============
-- Drop the 1-arg version so the 2-arg (email defaulted) is the single resolved overload;
-- existing 1-arg callers (roster + inline match setup) still resolve via the default.
drop function if exists create_managed_player(text);

create or replace function create_managed_player(
  p_display_name  text,
  p_contact_email text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name      text   := btrim(coalesce(p_display_name, ''));
  v_email     citext := nullif(btrim(coalesce(p_contact_email, '')), '')::citext;
  v_player_id uuid;
  v_token     uuid;
  v_expires   timestamptz;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if v_name = '' then raise exception 'name_required'; end if;

  insert into players (user_id, display_name, created_by)
  values (null, v_name, auth.uid())
  returning id into v_player_id;

  insert into player_claims (player_id, contact_email)
  values (v_player_id, v_email)
  returning claim_token, expires_at into v_token, v_expires;

  return jsonb_build_object(
    'player_id', v_player_id,
    'claim_token', v_token,
    'expires_at', v_expires);
end $$;

revoke all on function create_managed_player(text, text)   from public;
grant execute on function create_managed_player(text, text) to authenticated;

-- ============ _claim_managed_player: the one binder (internal) ============
-- Binds an unclaimed managed player row to an account: enforces the one-managed-identity
-- rule, folds the account's signup self-row (with any history) into the managed row via
-- _merge_player_rows, repoints the managed row to the account, and consumes the token.
create or replace function _claim_managed_player(p_managed_id uuid, p_uid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_self uuid;
begin
  -- v1: an account claims at most one MANAGED identity (created by someone else).
  if exists (
    select 1 from players
    where user_id = p_uid and created_by is distinct from p_uid
  ) then
    raise exception 'account_already_claimed_identity';
  end if;

  -- Fold the signup-created self-row (user_id = me, created_by = me) into the managed row.
  -- _merge_player_rows moves all history and DELETES the self-row, freeing the UNIQUE
  -- user_id so we can repoint the managed row to this account next.
  select id into v_self from players
   where user_id = p_uid and created_by = p_uid and id <> p_managed_id;
  if v_self is not null then
    perform _merge_player_rows(p_managed_id, v_self);   -- winner = managed, loser = self
  end if;

  update players set user_id = p_uid, claimed_at = now() where id = p_managed_id;
  delete from player_claims where player_id = p_managed_id;   -- single-use
end $$;

revoke all on function _claim_managed_player(uuid, uuid) from public;
-- No grants: internal-only, called from the claim RPCs below.

-- ============ claim_player: FIX — history-safe merge via the shared binder ============
-- Previously did a blind `delete from players ... where created_by = me`, which was written
-- before matches referenced players. That now hits the match_participants RESTRICT FK (claim
-- fails) or cascade-drops challenges. Route through _claim_managed_player instead.
create or replace function claim_player(p_claim_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;

  select pc.player_id, pc.expires_at, p.display_name, p.claimed_at
    into c
  from player_claims pc
  join players p on p.id = pc.player_id
  where pc.claim_token = p_claim_token;

  if not found then raise exception 'not_found'; end if;
  if c.claimed_at is not null then raise exception 'already_claimed'; end if;
  if c.expires_at < now() then raise exception 'expired'; end if;

  perform _claim_managed_player(c.player_id, auth.uid());

  return jsonb_build_object('player_id', c.player_id, 'display_name', c.display_name);
end $$;
-- grants preserved by create-or-replace (authenticated).

-- ============ my_claimable_profile: onboarding email-match lookup ============
-- For the signed-in user, returns an unclaimed managed profile whose contact_email matches
-- their auth email (if any), with a match count for the prompt. NULL when there's nothing to
-- claim. Security definer so the private contact_email drives the match without exposing it.
create or replace function my_claimable_profile()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email citext;
  r       record;
begin
  if v_uid is null then return null; end if;

  -- Already bound to a managed identity? Nothing to offer.
  if exists (select 1 from players where user_id = v_uid and created_by is distinct from v_uid) then
    return null;
  end if;

  select email::citext into v_email from auth.users where id = v_uid;
  if v_email is null then return null; end if;

  select p.id, p.display_name,
         (select count(*) from match_participants mp where mp.player_id = p.id) as match_count
    into r
  from players p
  join player_claims pc on pc.player_id = p.id
  where pc.contact_email = v_email
    and p.user_id is null
    and p.claimed_at is null
  order by p.created_at
  limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'player_id',    r.id,
    'display_name', r.display_name,
    'match_count',  r.match_count);
end $$;

revoke all on function my_claimable_profile()   from public;
grant execute on function my_claimable_profile() to authenticated;

-- ============ claim_matched_profile: tokenless claim for the email match ============
-- Claims the email-matched unclaimed managed profile for the caller. Same binder as the
-- token path. Raises 'no_match' if the caller's email matches no claimable profile.
create or replace function claim_matched_profile()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email citext;
  r       record;
begin
  if v_uid is null then raise exception 'auth_required'; end if;

  select email::citext into v_email from auth.users where id = v_uid;
  if v_email is null then raise exception 'no_match'; end if;

  select p.id, p.display_name into r
  from players p
  join player_claims pc on pc.player_id = p.id
  where pc.contact_email = v_email
    and p.user_id is null
    and p.claimed_at is null
  order by p.created_at
  limit 1;

  if not found then raise exception 'no_match'; end if;

  perform _claim_managed_player(r.id, v_uid);

  return jsonb_build_object('player_id', r.id, 'display_name', r.display_name);
end $$;

revoke all on function claim_matched_profile()   from public;
grant execute on function claim_matched_profile() to authenticated;
