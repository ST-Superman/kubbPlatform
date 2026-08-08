-- Kubb Platform — Phase 1 (W7): Claimable / managed players
-- Claim RPCs. Ports + refines design_handoff_kubb_platform_spike/functions.sql
-- (claim_player) and the review-doc §7 contract, against the LIVE schema where the
-- claim token lives in its own `player_claims` table (no select policy → tokens
-- can only ever surface through these SECURITY DEFINER functions).
--
-- Baseline (`profiles`/`players`/`player_claims`/trigger/RLS) was applied via
-- supabase/setup_identity.sql. This migration adds only the RPCs on top.
--
-- Apply with: supabase db push

-- ============ create_managed_player ============
-- An organizer adds a player by name. No account: user_id stays NULL, created_by
-- is the organizer. A single-use claim token is minted alongside. Returns the token
-- so the caller can build the /claim/<token> link — player_claims has no select
-- policy, so this return value is the ONLY way the token reaches the client.
create or replace function create_managed_player(p_display_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_display_name, ''));
  v_player_id uuid;
  v_token uuid;
  v_expires timestamptz;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if v_name = '' then raise exception 'name_required'; end if;

  insert into players (user_id, display_name, created_by)
  values (null, v_name, auth.uid())
  returning id into v_player_id;

  insert into player_claims (player_id)
  values (v_player_id)
  returning claim_token, expires_at into v_token, v_expires;

  return jsonb_build_object(
    'player_id', v_player_id,
    'claim_token', v_token,
    'expires_at', v_expires);
end $$;

-- ============ regenerate_claim_token ============
-- Rotates the token for an unclaimed managed player the caller created. This is the
-- recovery path if a link leaks (design screen 3). Invalidates the old token.
create or replace function regenerate_claim_token(p_player_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p record;
  v_token uuid;
  v_expires timestamptz;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;

  select id, created_by, claimed_at into p from players where id = p_player_id;
  if not found then raise exception 'not_found'; end if;
  if p.created_by is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if p.claimed_at is not null then raise exception 'already_claimed'; end if;

  -- upsert defensively (a claim row should already exist for a managed player)
  insert into player_claims (player_id, claim_token, expires_at)
  values (p_player_id, gen_random_uuid(), now() + interval '30 days')
  on conflict (player_id) do update
    set claim_token = gen_random_uuid(),
        expires_at  = now() + interval '30 days'
  returning claim_token, expires_at into v_token, v_expires;

  return jsonb_build_object('claim_token', v_token, 'expires_at', v_expires);
end $$;

-- ============ get_claim_link ============
-- Re-fetch the current token for a player the caller created (to re-display the link
-- / QR). Same authz as regenerate; does NOT rotate.
create or replace function get_claim_link(p_player_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p record;
  c record;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;

  select id, created_by, claimed_at into p from players where id = p_player_id;
  if not found then raise exception 'not_found'; end if;
  if p.created_by is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if p.claimed_at is not null then raise exception 'already_claimed'; end if;

  select claim_token, expires_at into c from player_claims where player_id = p_player_id;
  if not found then raise exception 'not_found'; end if;

  return jsonb_build_object('claim_token', c.claim_token, 'expires_at', c.expires_at);
end $$;

-- ============ list_my_managed_players ============
-- The organizer's unclaimed managed players joined to their claim tokens, in one
-- call. player_claims has no select policy, so the token can't come back through
-- PostgREST — this definer function is the read path for the /players surface.
create or replace function list_my_managed_players()
returns table (
  id           uuid,
  display_name text,
  created_at   timestamptz,
  claim_token  uuid,
  expires_at   timestamptz
)
language sql security definer set search_path = public as $$
  select p.id, p.display_name, p.created_at, pc.claim_token, pc.expires_at
  from players p
  join player_claims pc on pc.player_id = p.id
  where p.created_by = auth.uid()
    and p.user_id is null
    and p.claimed_at is null
  order by p.created_at desc;
$$;

-- ============ claim_preview ============
-- Anon-safe preview for the logged-out claim landing (design screen 4). Returns just
-- enough to render the right screen, never PII: the organizer-typed display name, and
-- for an already-claimed identity a MASKED handle (screen 7) so the claimer isn't leaked.
create or replace function claim_preview(p_claim_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_handle text;
  v_masked text;
begin
  select p.id, p.display_name, p.user_id, p.claimed_at, pc.expires_at
    into c
  from player_claims pc
  join players p on p.id = pc.player_id
  where pc.claim_token = p_claim_token;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if c.claimed_at is not null then
    select handle into v_handle from profiles where id = c.user_id;
    -- mask: first + last char, dots between (e.g. erik → e•••k)
    if v_handle is not null and length(v_handle) >= 2 then
      v_masked := left(v_handle, 1)
                  || repeat('•', greatest(length(v_handle) - 2, 1))
                  || right(v_handle, 1);
    end if;
    return jsonb_build_object(
      'status', 'already_claimed',
      'display_name', c.display_name,
      'claimed_at', c.claimed_at,
      'masked_handle', v_masked);
  end if;

  if c.expires_at < now() then
    return jsonb_build_object('status', 'expired', 'display_name', c.display_name);
  end if;

  return jsonb_build_object('status', 'ok', 'display_name', c.display_name);
end $$;

-- ============ claim_player ============
-- Called by an AUTHED user (claim link → sign up / sign in → this). Binds the managed
-- player row — and, from Phase 2, all its match history — to the caller's account.
-- Contract: review doc §7.
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

  -- v1: an account claims at most one MANAGED identity (created by someone else).
  if exists (
    select 1 from players
    where user_id = auth.uid() and created_by is distinct from auth.uid()
  ) then
    raise exception 'account_already_claimed_identity';
  end if;

  -- Merge (v1, deferred per review §7): the signup trigger already made a self-row for
  -- this account (user_id = me, created_by = me). players.user_id is UNIQUE, so we can't
  -- point two rows at the same account — drop the empty self-row and repoint the managed
  -- row (which carries the history). Safe now: no history-bearing tables reference
  -- players yet (matches arrive Phase 2). Full history-merge is deferred to when they do.
  delete from players
   where user_id = auth.uid()
     and created_by = auth.uid()
     and id <> c.player_id;

  update players
     set user_id = auth.uid(), claimed_at = now()
   where id = c.player_id;

  delete from player_claims where player_id = c.player_id;  -- single-use

  return jsonb_build_object('player_id', c.player_id, 'display_name', c.display_name);
end $$;

-- ============ grants ============
-- Lock these down explicitly rather than relying on the PUBLIC default. Only
-- claim_preview is reachable by anon (the logged-out landing page).
revoke all on function create_managed_player(text)  from public;
revoke all on function list_my_managed_players()     from public;
revoke all on function regenerate_claim_token(uuid)  from public;
revoke all on function get_claim_link(uuid)          from public;
revoke all on function claim_preview(uuid)           from public;
revoke all on function claim_player(uuid)            from public;

grant execute on function create_managed_player(text) to authenticated;
grant execute on function list_my_managed_players()    to authenticated;
grant execute on function regenerate_claim_token(uuid) to authenticated;
grant execute on function get_claim_link(uuid)         to authenticated;
grant execute on function claim_player(uuid)           to authenticated;
grant execute on function claim_preview(uuid)          to anon, authenticated;
