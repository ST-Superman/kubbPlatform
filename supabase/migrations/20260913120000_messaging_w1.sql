-- Kubb Platform — Messaging W1: DMs + in-match chat + safety
--
--   The unified conversation model (dm / group / match) + the write/read RPC surface
--   + a Broadcast-from-Database transport, mirroring the match engine:
--
--     messages INSERT  →  broadcast_message() trigger
--       →  realtime.send(payload, 'message', 'conv:<id>', false)
--       →  clients on supabase.channel('conv:<id>').on('broadcast', {event:'message'})
--
--   Same conventions as the rest of the platform: RLS-locked tables, every write
--   through a SECURITY DEFINER RPC that re-checks auth.uid() (players/challenges
--   pattern), realtime.send in an exception-swallowed AFTER trigger (broadcast_match_state
--   pattern), notification_prefs extended in place (not a new table).
--
--   W1 scope (locked): 1:1 DMs, in-match chat (persisted, players-only posting),
--   block + report, message privacy prefs. Groups = W2; announcements + moderation
--   console = W3. DM email notifications are DEFERRED (in-app realtime + unread badge
--   only in W1) — the report-admin email hook is wired but inert until configured.
--
--   NOTE: this project's migrations are applied MANUALLY — paste this whole file into
--   the Supabase SQL editor and run it. Smoke tests at the bottom (commented).
--
-- Depends on: setup_identity.sql (players, profiles), 20260808053111_match_engine.sql
--   (matches, match_participants), 20260810200000_challenges.sql (challenges),
--   20260909120000_notification_prefs_and_challenge_email.sql (notification_prefs),
--   20260809160045_realtime_and_harness.sql (realtime.send transport).

-- ============================================================================
-- TABLES
-- ============================================================================

-- A conversation is the one code path for dm / group / match chat.
create table if not exists conversations (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('dm','group','match')),
  match_id   uuid references matches(id) on delete cascade,   -- set when type='match'
  title      text,                                            -- group name (W2)
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Membership keyed on players.id (the identity entity matches/challenges use), NOT profiles.
create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  player_id       uuid not null references players(id) on delete cascade,
  role            text not null default 'member' check (role in ('member','owner')),
  last_read_at    timestamptz,                 -- drives unread counts
  muted           boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, player_id)
);

-- Messages are append-only + soft-deleted (no edit in v1); id may be client-generated
-- for idempotent resend, exactly like turns.
create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  sender_player_id uuid not null references players(id),
  body             text not null check (char_length(body) between 1 and 4000),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz                 -- soft delete (self or moderation)
);

create index if not exists messages_conv_created_idx
  on messages (conversation_id, created_at desc);
create index if not exists conversation_members_player_idx
  on conversation_members (player_id);

create table if not exists player_blocks (
  blocker_player_id uuid not null references players(id) on delete cascade,
  blocked_player_id uuid not null references players(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (blocker_player_id, blocked_player_id),
  check (blocker_player_id <> blocked_player_id)
);

create table if not exists message_reports (
  id                 uuid primary key default gen_random_uuid(),
  message_id         uuid references messages(id) on delete set null,
  reporter_player_id uuid references players(id),
  reason             text,
  status             text not null default 'open'
                     check (status in ('open','reviewed','actioned','dismissed')),
  created_at         timestamptz not null default now()
);

-- ============================================================================
-- notification_prefs — add the four messaging prefs in place (no new table)
-- ============================================================================
alter table notification_prefs
  add column if not exists dm_emails          boolean not null default true,
  add column if not exists dm_policy          text    not null default 'eligible',
  add column if not exists allow_group_add    boolean not null default true,
  add column if not exists announcement_promo boolean not null default true;

-- dm_policy: 'eligible' = anyone you've played/challenged may DM you; 'none' = DMs off.
do $$ begin
  alter table notification_prefs
    add constraint notification_prefs_dm_policy_chk check (dm_policy in ('eligible','none'));
exception when duplicate_object then null; end $$;

-- ============================================================================
-- ROW LEVEL SECURITY — read via membership; ALL writes via the RPCs below.
-- ============================================================================
alter table conversations        enable row level security;
alter table conversation_members enable row level security;
alter table messages             enable row level security;
alter table player_blocks         enable row level security;
alter table message_reports       enable row level security;

-- SECURITY DEFINER membership helper (mirrors can_view_match). Used by the RLS
-- policies below and re-used inside the write RPCs.
create or replace function is_conversation_member(p_conversation_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from conversation_members cm
    join players p on p.id = cm.player_id
    where cm.conversation_id = p_conversation_id
      and p.user_id = auth.uid()
  );
$$;

drop policy if exists conversations_select on conversations;
create policy conversations_select on conversations for select to authenticated
  using (is_conversation_member(id));

drop policy if exists conversation_members_select on conversation_members;
create policy conversation_members_select on conversation_members for select to authenticated
  using (is_conversation_member(conversation_id));

-- Messages: members read live (non-deleted) messages, minus any sender the caller blocked.
drop policy if exists messages_select on messages;
create policy messages_select on messages for select to authenticated
  using (
    is_conversation_member(conversation_id)
    and deleted_at is null
    and not exists (
      select 1 from player_blocks b
      join players me on me.id = b.blocker_player_id
      where me.user_id = auth.uid()
        and b.blocked_player_id = messages.sender_player_id
    )
  );

-- player_blocks / message_reports: own-row read only; no write policy (RPC-only),
-- same posture as notification_prefs / match_tokens.
drop policy if exists player_blocks_select on player_blocks;
create policy player_blocks_select on player_blocks for select to authenticated
  using (exists (select 1 from players p where p.id = blocker_player_id and p.user_id = auth.uid()));

drop policy if exists message_reports_select on message_reports;
create policy message_reports_select on message_reports for select to authenticated
  using (exists (select 1 from players p where p.id = reporter_player_id and p.user_id = auth.uid()));

-- ============================================================================
-- can_dm — the eligibility gate: shared match OR any challenge, not blocked,
--   target's dm_policy allows, target is a real account.
-- ============================================================================
create or replace function can_dm(p_target_player uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_my_player uuid;
  v_target_user uuid;
  v_policy text;
begin
  if v_me is null or p_target_player is null then return false; end if;
  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null or v_my_player = p_target_player then return false; end if;

  -- Target must be a real account (managed players can't receive DMs).
  select user_id into v_target_user from players where id = p_target_player;
  if v_target_user is null then return false; end if;

  -- Target's privacy setting.
  select dm_policy into v_policy from notification_prefs where user_id = v_target_user;
  if coalesce(v_policy, 'eligible') = 'none' then return false; end if;

  -- Neither may have blocked the other.
  if exists (
    select 1 from player_blocks b
    where (b.blocker_player_id = v_my_player   and b.blocked_player_id = p_target_player)
       or (b.blocker_player_id = p_target_player and b.blocked_player_id = v_my_player)
  ) then return false; end if;

  -- Kubb-native allow-list: shared match OR a challenge in either direction.
  return exists (
    select 1
    from match_participants mine
    join match_participants theirs
      on theirs.match_id = mine.match_id and theirs.id <> mine.id
    where mine.player_id = v_my_player and theirs.player_id = p_target_player
  ) or exists (
    select 1 from challenges c
    where (c.from_player = v_my_player   and c.to_player = p_target_player)
       or (c.from_player = p_target_player and c.to_player = v_my_player)
  );
end $$;

-- ============================================================================
-- start_or_get_dm — enforce can_dm; return the existing 1:1 or create it.
-- ============================================================================
create or replace function start_or_get_dm(p_target_player uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_my_player uuid;
  v_conv uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then raise exception 'no_player_for_account'; end if;
  if not can_dm(p_target_player) then raise exception 'dm_not_allowed'; end if;

  -- Serialize concurrent "open a DM" calls for the same unordered pair so we never
  -- create two conversations for one pair.
  perform pg_advisory_xact_lock(hashtext(
    least(v_my_player::text, p_target_player::text) ||
    greatest(v_my_player::text, p_target_player::text)));

  select c.id into v_conv
  from conversations c
  where c.type = 'dm'
    and exists (select 1 from conversation_members m
                where m.conversation_id = c.id and m.player_id = v_my_player)
    and exists (select 1 from conversation_members m
                where m.conversation_id = c.id and m.player_id = p_target_player)
  limit 1;

  if v_conv is not null then return v_conv; end if;

  insert into conversations (type, created_by) values ('dm', v_me) returning id into v_conv;
  insert into conversation_members (conversation_id, player_id)
  values (v_conv, v_my_player), (v_conv, p_target_player);
  return v_conv;
end $$;

-- ============================================================================
-- start_or_get_match_conversation — the in-match chat thread (persisted,
--   players-only). Caller must be a player participant; seeds every account-backed
--   participant as a member. Its own 'conv:<id>' topic, separate from 'match:<id>'.
-- ============================================================================
create or replace function start_or_get_match_conversation(p_match_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid; v_conv uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then raise exception 'no_player_for_account'; end if;

  -- Only a player of this match may open its chat (spectators excluded).
  if not exists (
    select 1 from match_participants mp
    where mp.match_id = p_match_id and mp.player_id = v_my_player
  ) then raise exception 'not_a_participant'; end if;

  perform pg_advisory_xact_lock(hashtext('match_conv:' || p_match_id::text));

  select id into v_conv from conversations
   where type = 'match' and match_id = p_match_id limit 1;
  if v_conv is null then
    insert into conversations (type, match_id, created_by)
    values ('match', p_match_id, v_me) returning id into v_conv;
  end if;

  -- Ensure every account-backed player participant is a member (idempotent).
  -- Managed players (no user_id) can't authenticate, so they're skipped.
  insert into conversation_members (conversation_id, player_id)
  select v_conv, mp.player_id
  from match_participants mp
  join players p on p.id = mp.player_id
  where mp.match_id = p_match_id and mp.player_id is not null and p.user_id is not null
  on conflict (conversation_id, player_id) do nothing;

  return v_conv;
end $$;

-- ============================================================================
-- send_message — membership + not-blocked + rate-limit; idempotent on p_client_id
--   (the message id, client-generated like turns). Insert broadcasts via the trigger.
-- ============================================================================
create or replace function send_message(p_conversation_id uuid, p_body text, p_client_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_my_player uuid;
  v_type text;
  v_other uuid;
  v_recent int;
  v_id uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then raise exception 'no_player_for_account'; end if;
  if p_body is null or char_length(p_body) < 1 or char_length(p_body) > 4000 then
    raise exception 'body_range';
  end if;
  if not is_conversation_member(p_conversation_id) then raise exception 'not_a_member'; end if;

  -- Rate limit: blunt spam (no moderation tooling yet). ~20 messages / trailing 60s.
  select count(*) into v_recent from messages
   where sender_player_id = v_my_player and created_at > now() - interval '60 seconds';
  if v_recent >= 20 then raise exception 'rate_limited'; end if;

  -- For a DM, a block in either direction stops the send.
  select type into v_type from conversations where id = p_conversation_id;
  if v_type = 'dm' then
    select m.player_id into v_other from conversation_members m
     where m.conversation_id = p_conversation_id and m.player_id <> v_my_player limit 1;
    if v_other is not null and exists (
      select 1 from player_blocks b
      where (b.blocker_player_id = v_my_player and b.blocked_player_id = v_other)
         or (b.blocker_player_id = v_other and b.blocked_player_id = v_my_player)
    ) then raise exception 'blocked'; end if;
  end if;

  -- Entitlement hook: chat is free during Beta. If DMs ever become paid, gate here
  -- (there is no is_entitled() today; the paywall triggers are inert).
  --   if v_type = 'dm' and not is_entitled(v_me) then raise exception 'not_entitled'; end if;

  v_id := coalesce(p_client_id, gen_random_uuid());
  insert into messages (id, conversation_id, sender_player_id, body)
  values (v_id, p_conversation_id, v_my_player, p_body)
  on conflict (id) do nothing;      -- idempotent resend
  return v_id;
end $$;

-- ============================================================================
-- list_my_conversations — inbox: conversation + last message + unread count.
-- ============================================================================
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
      'other', case when c.type = 'dm' then (
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
          'sender_player_id', msg.sender_player_id)
        from messages msg where msg.conversation_id = c.id
        order by msg.created_at desc limit 1),
      'last_at', (select msg.created_at from messages msg
                  where msg.conversation_id = c.id order by msg.created_at desc limit 1),
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

-- ============================================================================
-- conversation_messages — paginated thread read (blocked senders filtered out).
-- ============================================================================
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

  -- Take the newest v_limit before the cursor, then present oldest-first.
  select coalesce(jsonb_agg(row order by (row->>'created_at') asc), '[]'::jsonb) into arr
  from (
    select jsonb_build_object(
      'id', m.id,
      'sender_player_id', m.sender_player_id,
      'sender_display_name', p.display_name,
      'sender_handle', pr.handle::text,
      'body', case when m.deleted_at is null then m.body else null end,
      'deleted', m.deleted_at is not null,
      'created_at', m.created_at) as row
    from messages m
    join players p on p.id = m.sender_player_id
    left join profiles pr on pr.id = p.user_id
    where m.conversation_id = p_conversation_id
      and (p_before is null or m.created_at < p_before)
      and not exists (select 1 from player_blocks b
                      where b.blocker_player_id = v_my_player
                        and b.blocked_player_id = m.sender_player_id)
    order by m.created_at desc
    limit v_limit
  ) sub;
  return arr;
end $$;

-- ============================================================================
-- mark_read — set last_read_at = now() for the caller in a conversation.
-- ============================================================================
create or replace function mark_read(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  update conversation_members set last_read_at = now()
   where conversation_id = p_conversation_id and player_id = v_my_player;
end $$;

-- ============================================================================
-- block_player / unblock_player
-- ============================================================================
create or replace function block_player(p_player uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then raise exception 'no_player_for_account'; end if;
  if p_player is null or p_player = v_my_player then raise exception 'invalid_target'; end if;
  insert into player_blocks (blocker_player_id, blocked_player_id)
  values (v_my_player, p_player) on conflict do nothing;
end $$;

create or replace function unblock_player(p_player uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  delete from player_blocks where blocker_player_id = v_my_player and blocked_player_id = p_player;
end $$;

-- ============================================================================
-- report_message — file a report. Optional admin-email hook (inert until the
--   notify_report_url Vault secret is set), mirroring notify_challenge_created.
-- ============================================================================
create or replace function report_message(p_message_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_my_player uuid; v_id uuid;
  v_url text; v_secret text;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then raise exception 'no_player_for_account'; end if;

  insert into message_reports (message_id, reporter_player_id, reason)
  values (p_message_id, v_my_player, left(coalesce(p_reason, ''), 2000))
  returning id into v_id;

  -- Fire-and-forget admin email if configured. No-ops until a notify-report Edge
  -- Function is deployed and its URL stored in Vault (see notify_challenge_created).
  begin
    select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_report_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
    if v_url is not null and v_url <> '' then
      perform net.http_post(
        url     := v_url,
        headers := jsonb_build_object('Content-Type','application/json',
                                      'Authorization','Bearer ' || coalesce(v_secret,'')),
        body    := jsonb_build_object('report_id', v_id));
    end if;
  exception when others then null;   -- never let a mail/config problem fail the report
  end;
  return v_id;
end $$;

-- ============================================================================
-- Message privacy prefs — mirror my_notification_prefs / set_challenge_emails.
-- ============================================================================
create or replace function my_message_prefs()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); r record;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  insert into notification_prefs (user_id) values (v_me) on conflict (user_id) do nothing;
  select dm_policy, dm_emails, allow_group_add, announcement_promo
    into r from notification_prefs where user_id = v_me;
  return jsonb_build_object(
    'dm_policy',          coalesce(r.dm_policy, 'eligible'),
    'dm_emails',          coalesce(r.dm_emails, true),
    'allow_group_add',    coalesce(r.allow_group_add, true),
    'announcement_promo', coalesce(r.announcement_promo, true));
end $$;

create or replace function set_message_prefs(
  p_dm_policy text default null, p_dm_emails boolean default null,
  p_allow_group_add boolean default null, p_announcement_promo boolean default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if p_dm_policy is not null and p_dm_policy not in ('eligible','none') then
    raise exception 'dm_policy_invalid';
  end if;
  insert into notification_prefs (user_id) values (v_me) on conflict (user_id) do nothing;
  update notification_prefs set
    dm_policy          = coalesce(p_dm_policy, dm_policy),
    dm_emails          = coalesce(p_dm_emails, dm_emails),
    allow_group_add    = coalesce(p_allow_group_add, allow_group_add),
    announcement_promo = coalesce(p_announcement_promo, announcement_promo),
    updated_at         = now()
  where user_id = v_me;
  return my_message_prefs();
end $$;

-- ============================================================================
-- broadcast_message — AFTER INSERT trigger; pushes to topic 'conv:<id>', event
--   'message'. Best-effort (mirrors broadcast_match_state); never fails the write.
-- ============================================================================
create or replace function broadcast_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object(
        'id', new.id,
        'conversation_id', new.conversation_id,
        'sender_player_id', new.sender_player_id,
        'body', new.body,
        'created_at', new.created_at),
      'message', 'conv:' || new.conversation_id::text, false);
  exception when others then null;
  end;
  return null;
end $$;

drop trigger if exists trg_broadcast_message on messages;
create trigger trg_broadcast_message after insert on messages
  for each row execute function broadcast_message();

-- ============================================================================
-- Grants — helpers stay callable by authenticated (RLS policies invoke them);
--   all writes/reads are SECURITY DEFINER RPCs granted to authenticated.
-- ============================================================================
revoke all on function is_conversation_member(uuid)                     from public;
revoke all on function can_dm(uuid)                                     from public;
revoke all on function start_or_get_dm(uuid)                            from public;
revoke all on function start_or_get_match_conversation(uuid)            from public;
revoke all on function send_message(uuid, text, uuid)                   from public;
revoke all on function list_my_conversations()                         from public;
revoke all on function conversation_messages(uuid, timestamptz, int)    from public;
revoke all on function mark_read(uuid)                                  from public;
revoke all on function block_player(uuid)                               from public;
revoke all on function unblock_player(uuid)                             from public;
revoke all on function report_message(uuid, text)                       from public;
revoke all on function my_message_prefs()                              from public;
revoke all on function set_message_prefs(text, boolean, boolean, boolean) from public;

grant execute on function is_conversation_member(uuid)                     to authenticated;
grant execute on function can_dm(uuid)                                     to authenticated;
grant execute on function start_or_get_dm(uuid)                            to authenticated;
grant execute on function start_or_get_match_conversation(uuid)            to authenticated;
grant execute on function send_message(uuid, text, uuid)                   to authenticated;
grant execute on function list_my_conversations()                         to authenticated;
grant execute on function conversation_messages(uuid, timestamptz, int)    to authenticated;
grant execute on function mark_read(uuid)                                  to authenticated;
grant execute on function block_player(uuid)                               to authenticated;
grant execute on function unblock_player(uuid)                             to authenticated;
grant execute on function report_message(uuid, text)                       to authenticated;
grant execute on function my_message_prefs()                              to authenticated;
grant execute on function set_message_prefs(text, boolean, boolean, boolean) to authenticated;

-- ============================================================================
-- SMOKE TESTS (run in the SQL editor after applying)
--
--   These RPCs key on auth.uid(), which is NULL in the raw SQL editor (you're
--   `postgres`, not a signed-in user) — calling them bare raises 'auth_required'.
--   That's correct behavior. To exercise them, IMPERSONATE a user for one run by
--   setting the JWT-claims GUC inside a transaction:
--
--     begin;
--       select set_config('request.jwt.claims',
--         json_build_object('sub',
--           (select id from auth.users where email = 'you@example.com'))::text, true);
--       select my_message_prefs();            -- provisions + returns defaults
--     commit;
--
--   Eligibility + DM round-trip (impersonate A, target B's players.id):
--
--     begin;
--       select set_config('request.jwt.claims', json_build_object('sub',
--         (select id from auth.users where email = 'accountA@example.com'))::text, true);
--       select can_dm((select id from players where user_id =
--         (select id from auth.users where email = 'accountB@example.com')));  -- t/f
--       select start_or_get_dm((select id from players where user_id =
--         (select id from auth.users where email = 'accountB@example.com'))); -- conv id
--       select send_message('<conv-id from above>', 'gg wp');                 -- msg id
--       select list_my_conversations();                                       -- inbox
--       select conversation_messages('<conv-id>');                            -- thread
--     commit;
-- ============================================================================
