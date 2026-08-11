-- Kubb Platform — "request a fresh link" (AU-8)
--   A visitor on an expired claim link can flag it; the organizer sees the flag on
--   their managed player and regenerates. Stored as a marker on player_claims (one
--   claim row per managed player) rather than a whole new table.
--
-- Apply with: supabase db push

alter table player_claims add column if not exists fresh_link_requested_at timestamptz;

-- Anon-callable: flag the managed player behind an (expired) token as needing a fresh link.
create or replace function request_fresh_link(p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_player uuid;
begin
  select pc.player_id into v_player
  from player_claims pc
  join players p on p.id = pc.player_id
  where pc.claim_token = p_claim_token and p.claimed_at is null;

  if v_player is null then return jsonb_build_object('status', 'not_found'); end if;

  update player_claims set fresh_link_requested_at = now() where player_id = v_player;
  return jsonb_build_object('status', 'ok');
end $$;

-- Regenerating clears the request flag (organizer has answered it).
create or replace function regenerate_claim_token(p_player_id uuid) returns jsonb
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

  insert into player_claims (player_id, claim_token, expires_at)
  values (p_player_id, gen_random_uuid(), now() + interval '30 days')
  on conflict (player_id) do update
    set claim_token = gen_random_uuid(),
        expires_at  = now() + interval '30 days',
        fresh_link_requested_at = null
  returning claim_token, expires_at into v_token, v_expires;

  return jsonb_build_object('claim_token', v_token, 'expires_at', v_expires);
end $$;

-- Return type changes (new column) → must drop before recreate.
drop function if exists list_my_managed_players();
create or replace function list_my_managed_players()
returns table (
  id                      uuid,
  display_name            text,
  created_at              timestamptz,
  claim_token             uuid,
  expires_at              timestamptz,
  fresh_link_requested_at timestamptz
)
language sql security definer set search_path = public as $$
  select p.id, p.display_name, p.created_at, pc.claim_token, pc.expires_at,
         pc.fresh_link_requested_at
  from players p
  join player_claims pc on pc.player_id = p.id
  where p.created_by = auth.uid()
    and p.user_id is null
    and p.claimed_at is null
  order by p.created_at desc;
$$;

revoke all on function request_fresh_link(uuid)     from public;
revoke all on function list_my_managed_players()    from public;
grant execute on function request_fresh_link(uuid)  to anon, authenticated;
grant execute on function list_my_managed_players() to authenticated;
