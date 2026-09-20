-- Kubb Platform — Pass 3 (F13/D8): richer inbox rows
--
--   list_my_conversations gains four fields so the inbox stops signalling by weight
--   alone and stops showing "Match chat" for every match:
--     • other        — now populated for MATCH rows too (the opponent), not just DMs
--     • last_message.sender_display_name — for a "Sender: " preview prefix (group/match)
--     • member_count — for the "GROUP · n" chip
--     • blocked      — dim the row + "Unblock in settings" (dm/match, either direction)
--
--   Additive, no schema change (create-or-replace keeps the authenticated grant).
--   NOTE: applied MANUALLY — paste into the Supabase SQL editor and run.

create or replace function list_my_conversations()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid; arr jsonb;
begin
  if v_me is null then return '[]'::jsonb; end if;
  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(row order by (row->>'last_at') desc nulls last), '[]'::jsonb) into arr
  from (
    select jsonb_build_object(
      'conversation_id', c.id,
      'type', c.type,
      'title', c.title,
      'match_id', c.match_id,
      'muted', mem.muted,
      -- opponent for DM *and* match (the single other member)
      'other', case when c.type in ('dm','match') then (
        select jsonb_build_object(
          'player_id', op.id, 'display_name', op.display_name,
          'handle', opr.handle::text, 'avatar_url', opr.avatar_url)
        from conversation_members om
        join players op on op.id = om.player_id
        left join profiles opr on opr.id = op.user_id
        where om.conversation_id = c.id and om.player_id <> v_my_player
        limit 1) else null end,
      'last_message', (
        select jsonb_build_object(
          'body', case when msg.deleted_at is null then msg.body else null end,
          'created_at', msg.created_at,
          'sender_player_id', msg.sender_player_id,
          'sender_display_name', sp.display_name)
        from messages msg
        join players sp on sp.id = msg.sender_player_id
        where msg.conversation_id = c.id
        order by msg.created_at desc limit 1),
      'last_at', (select msg.created_at from messages msg
                  where msg.conversation_id = c.id order by msg.created_at desc limit 1),
      'member_count', (select count(*) from conversation_members cm2 where cm2.conversation_id = c.id),
      'blocked', case when c.type in ('dm','match') then exists (
        select 1 from conversation_members om
        join player_blocks b on (
          (b.blocker_player_id = v_my_player and b.blocked_player_id = om.player_id) or
          (b.blocker_player_id = om.player_id and b.blocked_player_id = v_my_player))
        where om.conversation_id = c.id and om.player_id <> v_my_player) else false end,
      'unread', (
        select count(*) from messages msg
        where msg.conversation_id = c.id and msg.deleted_at is null
          and msg.sender_player_id <> v_my_player
          and (mem.last_read_at is null or msg.created_at > mem.last_read_at))
    ) as row
    from conversation_members mem
    join conversations c on c.id = mem.conversation_id
    where mem.player_id = v_my_player
  ) sub;
  return arr;
end $$;

-- Smoke:
--   select jsonb_array_length(list_my_conversations());
