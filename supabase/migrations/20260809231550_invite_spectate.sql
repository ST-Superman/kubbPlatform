-- Kubb Platform — Phase 3 (slice 3): spectate links
-- Invite-to-play reuses the existing claim RPCs (get_claim_link / claim_player); this
-- migration adds the spectate side:
--   create_spectate_link(match)  → { token }   (authed participant; idempotent)
--   match_state_by_token(token)  → match_state  (ANON-callable; for the public /watch page)
--
-- Apply with: supabase db push

-- ============ create_spectate_link ============
create or replace function create_spectate_link(p_match_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_token uuid;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if not can_view_match(p_match_id) then raise exception 'forbidden'; end if;

  -- reuse an existing spectate token for this match, else mint one
  select token into v_token
  from match_tokens
  where match_id = p_match_id and scope = 'spectate' and participant_id is null
  limit 1;

  if v_token is null then
    insert into match_tokens (match_id, participant_id, scope)
    values (p_match_id, null, 'spectate')
    returning token into v_token;
  end if;

  return jsonb_build_object('token', v_token);
end $$;

-- ============ match_state_by_token ============
-- Anon-safe read for /watch/<token>. Accepts a spectate (or play) token, returns the
-- same shape as match_state so the read-only view reuses the same components.
create or replace function match_state_by_token(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t record;
begin
  select match_id, scope, expires_at into t
  from match_tokens
  where token = p_token and scope in ('spectate', 'play');

  if not found then return jsonb_build_object('error', 'invalid'); end if;
  if t.expires_at is not null and t.expires_at < now() then
    return jsonb_build_object('error', 'expired');
  end if;

  return match_state(t.match_id) || jsonb_build_object('spectator', true);
end $$;

revoke all on function create_spectate_link(uuid) from public;
revoke all on function match_state_by_token(uuid) from public;
grant execute on function create_spectate_link(uuid) to authenticated;
grant execute on function match_state_by_token(uuid) to anon, authenticated;
