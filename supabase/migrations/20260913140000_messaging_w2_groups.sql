-- Kubb Platform — Messaging W2: group conversations
--
--   Groups reuse the entire W1 machinery — conversations(type='group'),
--   conversation_members, messages, the broadcast_message trigger, send_message,
--   conversation_messages, list_my_conversations, mark_read, block/report all work
--   unchanged for type='group'. W2 only adds the group LIFECYCLE: create, add /
--   remove members, rename, leave, plus the eligibility gate + two read helpers.
--
--   Eligibility to be ADDED to a group = shared match/challenge history with the
--   adder + not blocked + the target's allow_group_add pref is on. (Distinct from
--   can_dm, which also honors dm_policy — dm_policy governs 1:1 DMs, not group adds.)
--
--   Owner-only management in v1: the creator is 'owner'; only an owner adds/removes
--   members or renames. Any member may leave; if the owner leaves, ownership passes
--   to the earliest-joined remaining member.
--
--   NOTE: applied MANUALLY — paste into the Supabase SQL editor and run.
--
-- Depends on: 20260913120000_messaging_w1.sql (conversations, conversation_members,
--   is_conversation_member, notification_prefs.allow_group_add), setup_identity.sql,
--   match_engine + challenges (the shared-history sources).

-- ============================================================================
-- _group_addable — internal: may p_actor add p_target to a group? (accounts only,
--   shared history, not blocked either way, target hasn't opted out of group adds).
-- ============================================================================
create or replace function _group_addable(p_actor_player uuid, p_target_player uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_target_user uuid; v_allow boolean;
begin
  if p_actor_player is null or p_target_player is null
     or p_actor_player = p_target_player then return false; end if;

  select user_id into v_target_user from players where id = p_target_player;
  if v_target_user is null then return false; end if;   -- accounts only

  select allow_group_add into v_allow from notification_prefs where user_id = v_target_user;
  if coalesce(v_allow, true) = false then return false; end if;

  if exists (
    select 1 from player_blocks b
    where (b.blocker_player_id = p_actor_player   and b.blocked_player_id = p_target_player)
       or (b.blocker_player_id = p_target_player and b.blocked_player_id = p_actor_player)
  ) then return false; end if;

  return exists (
    select 1 from match_participants mine
    join match_participants theirs
      on theirs.match_id = mine.match_id and theirs.id <> mine.id
    where mine.player_id = p_actor_player and theirs.player_id = p_target_player
  ) or exists (
    select 1 from challenges c
    where (c.from_player = p_actor_player   and c.to_player = p_target_player)
       or (c.from_player = p_target_player and c.to_player = p_actor_player)
  );
end $$;

-- ============================================================================
-- _is_group_owner — internal: is the caller's player the owner of this group?
-- ============================================================================
create or replace function _is_group_owner(p_conversation_id uuid, p_player uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_members cm
    join conversations c on c.id = cm.conversation_id
    where cm.conversation_id = p_conversation_id
      and cm.player_id = p_player
      and cm.role = 'owner'
      and c.type = 'group'
  );
$$;

-- ============================================================================
-- create_group — creator = owner; add each eligible invitee. Raises if none of
--   the invitees are eligible (so we never leave a one-member "group").
-- ============================================================================
create or replace function create_group(p_title text, p_member_player_ids uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_my_player uuid;
  v_conv uuid;
  v_target uuid;
  v_added int := 0;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then raise exception 'no_player_for_account'; end if;
  if p_title is null or char_length(btrim(p_title)) < 1 or char_length(p_title) > 100 then
    raise exception 'title_range';
  end if;

  insert into conversations (type, title, created_by)
  values ('group', btrim(p_title), v_me) returning id into v_conv;
  insert into conversation_members (conversation_id, player_id, role)
  values (v_conv, v_my_player, 'owner');

  if p_member_player_ids is not null then
    foreach v_target in array p_member_player_ids loop
      if v_target <> v_my_player and _group_addable(v_my_player, v_target) then
        insert into conversation_members (conversation_id, player_id)
        values (v_conv, v_target) on conflict do nothing;
        v_added := v_added + 1;
      end if;
    end loop;
  end if;

  -- No eligible invitees → roll the whole thing back (exception aborts the txn).
  if v_added = 0 then raise exception 'no_eligible_members'; end if;
  return v_conv;
end $$;

-- ============================================================================
-- add_group_members — owner only; add each eligible invitee (idempotent).
-- ============================================================================
create or replace function add_group_members(p_conversation_id uuid, p_member_player_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid; v_target uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  if not _is_group_owner(p_conversation_id, v_my_player) then raise exception 'not_group_owner'; end if;

  if p_member_player_ids is not null then
    foreach v_target in array p_member_player_ids loop
      if _group_addable(v_my_player, v_target) then
        insert into conversation_members (conversation_id, player_id)
        values (p_conversation_id, v_target) on conflict do nothing;
      end if;
    end loop;
  end if;
end $$;

-- ============================================================================
-- remove_group_member — owner only; can't remove yourself here (use leave_group).
-- ============================================================================
create or replace function remove_group_member(p_conversation_id uuid, p_player uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  if not _is_group_owner(p_conversation_id, v_my_player) then raise exception 'not_group_owner'; end if;
  if p_player = v_my_player then raise exception 'use_leave_group'; end if;
  delete from conversation_members
   where conversation_id = p_conversation_id and player_id = p_player;
end $$;

-- ============================================================================
-- rename_group — owner only.
-- ============================================================================
create or replace function rename_group(p_conversation_id uuid, p_title text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  if not _is_group_owner(p_conversation_id, v_my_player) then raise exception 'not_group_owner'; end if;
  if p_title is null or char_length(btrim(p_title)) < 1 or char_length(p_title) > 100 then
    raise exception 'title_range';
  end if;
  update conversations set title = btrim(p_title) where id = p_conversation_id;
end $$;

-- ============================================================================
-- leave_group — remove yourself. If you were the owner and members remain, pass
--   ownership to the earliest-joined remaining member.
-- ============================================================================
create or replace function leave_group(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid; v_was_owner boolean; v_next uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;

  select (role = 'owner') into v_was_owner from conversation_members
   where conversation_id = p_conversation_id and player_id = v_my_player;
  if v_was_owner is null then return; end if;   -- not a member; nothing to do

  delete from conversation_members
   where conversation_id = p_conversation_id and player_id = v_my_player;

  if v_was_owner then
    select player_id into v_next from conversation_members
     where conversation_id = p_conversation_id order by joined_at asc limit 1;
    if v_next is not null then
      update conversation_members set role = 'owner'
       where conversation_id = p_conversation_id and player_id = v_next;
    end if;
  end if;
end $$;

-- ============================================================================
-- list_groupable_players — accounts the caller may add to a group (for the picker).
-- ============================================================================
create or replace function list_groupable_players()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid; arr jsonb;
begin
  if v_me is null then return '[]'::jsonb; end if;
  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'player_id', p.id, 'display_name', p.display_name,
      'handle', pr.handle::text, 'avatar_url', pr.avatar_url)
    order by p.display_name), '[]'::jsonb) into arr
  from players p
  left join profiles pr on pr.id = p.user_id
  where p.user_id is not null and _group_addable(v_my_player, p.id);
  return arr;
end $$;

-- ============================================================================
-- group_members — the roster for a conversation (membership-gated).
-- ============================================================================
create or replace function group_members(p_conversation_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare arr jsonb;
begin
  if not is_conversation_member(p_conversation_id) then raise exception 'not_a_member'; end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'player_id', p.id, 'display_name', p.display_name,
      'handle', pr.handle::text, 'avatar_url', pr.avatar_url,
      'role', cm.role, 'joined_at', cm.joined_at)
    order by cm.role desc, p.display_name), '[]'::jsonb) into arr
  from conversation_members cm
  join players p on p.id = cm.player_id
  left join profiles pr on pr.id = p.user_id
  where cm.conversation_id = p_conversation_id;
  return arr;
end $$;

-- ============================================================================
-- Grants
-- ============================================================================
revoke all on function _group_addable(uuid, uuid)                       from public;
revoke all on function _is_group_owner(uuid, uuid)                       from public;
revoke all on function create_group(text, uuid[])                        from public;
revoke all on function add_group_members(uuid, uuid[])                   from public;
revoke all on function remove_group_member(uuid, uuid)                   from public;
revoke all on function rename_group(uuid, text)                          from public;
revoke all on function leave_group(uuid)                                 from public;
revoke all on function list_groupable_players()                         from public;
revoke all on function group_members(uuid)                               from public;

-- Internal helpers stay callable by the definer RPCs above (and RLS uses none of
-- them), but grant execute to authenticated is harmless and keeps parity.
grant execute on function create_group(text, uuid[])      to authenticated;
grant execute on function add_group_members(uuid, uuid[]) to authenticated;
grant execute on function remove_group_member(uuid, uuid) to authenticated;
grant execute on function rename_group(uuid, text)        to authenticated;
grant execute on function leave_group(uuid)               to authenticated;
grant execute on function list_groupable_players()        to authenticated;
grant execute on function group_members(uuid)             to authenticated;

-- ============================================================================
-- SMOKE TESTS (impersonate a user — see the W1 file's header for the shim)
--   select list_groupable_players();                       -- who you can add
--   select create_group('Weekend crew', array['<player-b>','<player-c>']::uuid[]);
--   select group_members('<group-conv-id>');               -- roster incl. roles
--   select add_group_members('<group-conv-id>', array['<player-d>']::uuid[]);
--   select rename_group('<group-conv-id>', 'Sunday crew');
--   select leave_group('<group-conv-id>');                 -- owner hands off
-- ============================================================================
