-- Kubb Platform — Pass 3 (Q5): match → DM rollup
--
--   When a 1v1 human-vs-human match finishes, its chat rolls into the two players'
--   DM. Decisions (locked 2026-09-20): hourly pg_cron SWEEP (no completion trigger
--   yet); SOFT-merge (mark merged + hidden, never delete); blocked pair → discard,
--   no DM; 1v1 human only (no bots / 2v2 / groups); NEW matches only (no backfill).
--   Moved messages keep their real created_at for display; a per-block `sort_at`
--   keeps the whole match block contiguous in the DM timeline.
--
--   NOTE: applied MANUALLY. The ALTERs take brief exclusive locks — run with
--     set lock_timeout = '5s'; set statement_timeout = '60s';
--   above this file, and retry if it lock-times-out (everything is idempotent).

-- ---- schema ----------------------------------------------------------------
alter table messages add column if not exists from_match_id uuid references matches(id) on delete set null;

-- sort_at drives thread order + pagination (= created_at normally; a tight range at
-- the match's anchor for a moved block, so nothing can wedge into the block).
alter table messages add column if not exists sort_at timestamptz;
alter table messages alter column sort_at set default now(); -- concurrent inserts stay non-null
update messages set sort_at = created_at where sort_at is null; -- backfill existing rows
alter table messages alter column sort_at set not null;
create index if not exists messages_conv_sort_idx on messages (conversation_id, sort_at);

alter table conversations add column if not exists merged_into uuid references conversations(id) on delete set null;
alter table conversations add column if not exists hidden boolean not null default false;

-- ---- the sweep (service_role only; run hourly by pg_cron) -------------------
create or replace function sweep_match_rollups()
returns int
language plpgsql security definer set search_path = public as $$
declare
  r record; pa uuid; pb uuid; v_dm uuid; v_anchor timestamptz; v_n int := 0;
begin
  for r in
    select c.id as conv_id, c.match_id
    from conversations c
    join matches m on m.id = c.match_id
    where c.type = 'match' and c.hidden = false and c.merged_into is null
      and m.status = 'finished'
      -- exactly two participants, both account-backed humans (excludes bots / 2v2 / groups)
      and (select count(*) from match_participants mp where mp.match_id = c.match_id and mp.player_id is not null) = 2
      and (select count(*) from match_participants mp join players p on p.id = mp.player_id
           where mp.match_id = c.match_id and p.user_id is not null) = 2
  loop
    select min(mp.player_id), max(mp.player_id) into pa, pb
    from match_participants mp where mp.match_id = r.match_id and mp.player_id is not null;

    -- Blocked either way → discard the thread, create no DM (D4).
    if exists (select 1 from player_blocks b
               where (b.blocker_player_id = pa and b.blocked_player_id = pb)
                  or (b.blocker_player_id = pb and b.blocked_player_id = pa)) then
      update conversations set hidden = true where id = r.conv_id;
      v_n := v_n + 1;
      continue;
    end if;

    -- Resolve or create the DM for this pair (bypasses can_dm — they demonstrably
    -- played). Same advisory lock as start_or_get_dm so we never double-create.
    perform pg_advisory_xact_lock(hashtext(least(pa::text, pb::text) || greatest(pa::text, pb::text)));
    select c.id into v_dm from conversations c
     where c.type = 'dm'
       and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.player_id = pa)
       and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.player_id = pb)
     limit 1;
    if v_dm is null then
      insert into conversations (type, created_by) values ('dm', null) returning id into v_dm;
      insert into conversation_members (conversation_id, player_id) values (v_dm, pa), (v_dm, pb);
    end if;

    -- Move the block, keeping real created_at; sort_at = a tight increasing range at
    -- the block's last-message time so it renders as one contiguous unit.
    select max(created_at) into v_anchor from messages where conversation_id = r.conv_id;
    if v_anchor is not null then
      with ordered as (
        select id, row_number() over (order by created_at, id) as rn
        from messages where conversation_id = r.conv_id
      )
      update messages msg
         set conversation_id = v_dm,
             from_match_id = r.match_id,
             sort_at = v_anchor + (o.rn * interval '1 microsecond')
      from ordered o
      where msg.id = o.id;
    end if;

    update conversations set merged_into = v_dm, hidden = true where id = r.conv_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function sweep_match_rollups() from public, anon, authenticated;
grant execute on function sweep_match_rollups() to service_role;

-- ---- resolver: a finished/merged match's chat IS the DM (D5) ----------------
create or replace function start_or_get_match_conversation(p_match_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid; v_conv uuid; v_merged uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then raise exception 'no_player_for_account'; end if;

  if not exists (
    select 1 from match_participants mp
    where mp.match_id = p_match_id and mp.player_id = v_my_player
  ) then raise exception 'not_a_participant'; end if;

  perform pg_advisory_xact_lock(hashtext('match_conv:' || p_match_id::text));

  -- Already rolled up → the DM is the thread now.
  select id, merged_into into v_conv, v_merged from conversations
   where type = 'match' and match_id = p_match_id limit 1;
  if v_merged is not null then return v_merged; end if;

  if v_conv is null then
    insert into conversations (type, match_id, created_by)
    values ('match', p_match_id, v_me) returning id into v_conv;
  end if;

  insert into conversation_members (conversation_id, player_id)
  select v_conv, mp.player_id
  from match_participants mp
  join players p on p.id = mp.player_id
  where mp.match_id = p_match_id and mp.player_id is not null and p.user_id is not null
  on conflict (conversation_id, player_id) do nothing;

  return v_conv;
end $$;

-- ---- reads: order/paginate by sort_at; return from_match_id + sort_at --------
create or replace function conversation_messages(
  p_conversation_id uuid, p_before timestamptz default null, p_limit int default 50)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid; v_limit int; arr jsonb;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  if not is_conversation_member(p_conversation_id) then raise exception 'not_a_member'; end if;
  v_limit := least(coalesce(p_limit, 50), 200);

  select coalesce(jsonb_agg(row order by (row->>'sort_at') asc), '[]'::jsonb) into arr
  from (
    select jsonb_build_object(
      'id', m.id,
      'sender_player_id', m.sender_player_id,
      'sender_display_name', p.display_name,
      'sender_handle', pr.handle::text,
      'body', case when m.deleted_at is null then m.body else null end,
      'deleted', m.deleted_at is not null,
      'created_at', m.created_at,
      'sort_at', m.sort_at,
      'from_match_id', m.from_match_id) as row
    from messages m
    join players p on p.id = m.sender_player_id
    left join profiles pr on pr.id = p.user_id
    where m.conversation_id = p_conversation_id
      and (p_before is null or m.sort_at < p_before)
      and not exists (select 1 from player_blocks b
                      where b.blocker_player_id = v_my_player
                        and b.blocked_player_id = m.sender_player_id)
    order by m.sort_at desc
    limit v_limit
  ) sub;
  return arr;
end $$;

-- ---- inbox: hide merged match rows (superset of 20260920120000) -------------
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
      and c.merged_into is null and c.hidden = false   -- hide rolled-up / discarded match rows
  ) sub;
  return arr;
end $$;

-- ---- pg_cron (run ONCE, manually — pg_cron already enabled for the digests) --
--   select cron.schedule('match-dm-rollup', '17 * * * *', $$select sweep_match_rollups();$$);
--   verify:      select jobname, schedule from cron.job where jobname = 'match-dm-rollup';
--   on-demand:   select sweep_match_rollups();
