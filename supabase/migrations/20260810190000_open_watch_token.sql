-- Kubb Platform — open watch-token access
--   Match rows on another member's profile must be viewable by non-participants.
--   create_spectate_link is participant-only (can_view_match); this variant lets ANY
--   signed-in member mint/reuse the match's canonical spectate token, so profiles can
--   link non-self match rows to the read-only /watch view. (Members-only app; watch
--   links are already "anyone with the link can watch".) One token per match — reused.
--
-- Apply with: supabase db push

create or replace function get_match_watch_token(p_match_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_token uuid;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if not exists (select 1 from matches where id = p_match_id) then
    raise exception 'match_not_found';
  end if;

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

revoke all on function get_match_watch_token(uuid) from public;
grant execute on function get_match_watch_token(uuid) to authenticated;
