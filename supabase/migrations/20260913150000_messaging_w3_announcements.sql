-- Kubb Platform — Messaging W3: announcements + moderation console
--
--   Two features, one migration:
--
--   1. ANNOUNCEMENTS — the "message all users" locked decision: a read-only,
--      one-to-many broadcast. Admins publish; everyone reads. Separate from the
--      conversation model (no per-user membership row for the whole user base).
--      Users may mute 'promo' announcements (notification_prefs.announcement_promo);
--      'critical' is always delivered.
--
--   2. MODERATION — a minimal reports console over message_reports (W1). Admins list
--      open reports and resolve them (reviewed / actioned / dismissed), optionally
--      soft-deleting the offending message.
--
--   ADMIN GATE — there is no admin role today, so this adds a `platform_admins` table
--   + is_platform_admin() (SECURITY DEFINER, the platform's gate convention) and seeds
--   the owner. Every admin RPC self-checks is_platform_admin(); add more admins by
--   inserting into platform_admins from the SQL editor.
--
--   NOTE: applied MANUALLY — paste into the Supabase SQL editor and run.
--
-- Depends on: setup_identity.sql, 20260909120000_notification_prefs...sql +
--   20260913120000_messaging_w1.sql (notification_prefs.announcement_promo,
--   message_reports, messages).

-- ============================================================================
-- platform_admins + is_platform_admin — the admin gate.
-- ============================================================================
create table if not exists platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;
-- Own-row read only (so a signed-in admin can confirm their own status); membership
-- is managed from the SQL editor / service_role, never a client write.
drop policy if exists platform_admins_select on platform_admins;
create policy platform_admins_select on platform_admins for select to authenticated
  using (user_id = auth.uid());

create or replace function is_platform_admin(p_uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = coalesce(p_uid, auth.uid()));
$$;

-- Seed the owner (idempotent). Add more admins later with:
--   insert into platform_admins (user_id)
--   select id from auth.users where email = 'someone@example.com'
--   on conflict (user_id) do nothing;
insert into platform_admins (user_id)
select id from auth.users where email = 'sathomps@gmail.com'
on conflict (user_id) do nothing;

-- ============================================================================
-- announcements + announcement_reads
-- ============================================================================
create table if not exists announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 200),
  body         text not null check (char_length(body) between 1 and 8000),
  severity     text not null default 'promo' check (severity in ('promo','critical')),
  published_at timestamptz,                       -- null = draft
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create index if not exists announcements_published_idx
  on announcements (published_at desc) where published_at is not null;

create table if not exists announcement_reads (
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table announcements      enable row level security;
alter table announcement_reads enable row level security;

-- Published rows are readable by everyone; drafts only by admins. Writes via RPC.
drop policy if exists announcements_select on announcements;
create policy announcements_select on announcements for select to authenticated
  using (published_at is not null or is_platform_admin(auth.uid()));

drop policy if exists announcement_reads_select on announcement_reads;
create policy announcement_reads_select on announcement_reads for select to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- list_announcements — published, honoring the promo mute, with a read flag.
-- ============================================================================
create or replace function list_announcements()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_promo boolean; arr jsonb;
begin
  if v_me is null then return '[]'::jsonb; end if;
  select announcement_promo into v_promo from notification_prefs where user_id = v_me;
  v_promo := coalesce(v_promo, true);

  select coalesce(jsonb_agg(row order by (row->>'published_at') desc), '[]'::jsonb) into arr
  from (
    select jsonb_build_object(
      'id', a.id, 'title', a.title, 'body', a.body, 'severity', a.severity,
      'published_at', a.published_at,
      'read', exists (select 1 from announcement_reads r
                      where r.announcement_id = a.id and r.user_id = v_me)
    ) as row
    from announcements a
    where a.published_at is not null
      and (a.severity = 'critical' or v_promo)   -- muting promo never hides critical
  ) sub;
  return arr;
end $$;

-- ============================================================================
-- mark_announcement_read
-- ============================================================================
create or replace function mark_announcement_read(p_announcement_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'auth_required'; end if;
  insert into announcement_reads (announcement_id, user_id)
  values (p_announcement_id, v_me) on conflict do nothing;
end $$;

-- ============================================================================
-- publish_announcement (admin) — create a published announcement or a draft.
-- ============================================================================
create or replace function publish_announcement(
  p_title text, p_body text, p_severity text default 'promo', p_publish boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_id uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if not is_platform_admin(v_me) then raise exception 'not_admin'; end if;
  if p_title is null or char_length(btrim(p_title)) < 1 or char_length(p_title) > 200 then
    raise exception 'title_range'; end if;
  if p_body is null or char_length(btrim(p_body)) < 1 or char_length(p_body) > 8000 then
    raise exception 'body_range'; end if;
  if p_severity not in ('promo','critical') then raise exception 'severity_invalid'; end if;

  insert into announcements (title, body, severity, published_at, created_by)
  values (btrim(p_title), btrim(p_body), p_severity,
          case when p_publish then now() else null end, v_me)
  returning id into v_id;
  return v_id;
end $$;

-- ============================================================================
-- list_all_announcements (admin) — includes drafts, newest first.
-- ============================================================================
create or replace function list_all_announcements()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); arr jsonb;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if not is_platform_admin(v_me) then raise exception 'not_admin'; end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id, 'title', a.title, 'body', a.body, 'severity', a.severity,
      'published_at', a.published_at, 'created_at', a.created_at)
    order by a.created_at desc), '[]'::jsonb) into arr
  from announcements a;
  return arr;
end $$;

-- ============================================================================
-- list_message_reports (admin) — the moderation queue. Shows the message body even
--   when soft-deleted so the admin can still triage. Optional status filter.
-- ============================================================================
create or replace function list_message_reports(p_status text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); arr jsonb;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if not is_platform_admin(v_me) then raise exception 'not_admin'; end if;

  select coalesce(jsonb_agg(row order by (row->>'created_at') desc), '[]'::jsonb) into arr
  from (
    select jsonb_build_object(
      'report_id', r.id,
      'status', r.status,
      'reason', r.reason,
      'created_at', r.created_at,
      'message', case when m.id is null then null else jsonb_build_object(
        'id', m.id, 'conversation_id', m.conversation_id,
        'body', m.body, 'deleted', m.deleted_at is not null,
        'created_at', m.created_at) end,
      'sender', case when sp.id is null then null else jsonb_build_object(
        'display_name', sp.display_name, 'handle', spr.handle::text) end,
      'reporter', case when rp.id is null then null else jsonb_build_object(
        'display_name', rp.display_name, 'handle', rpr.handle::text) end
    ) as row
    from message_reports r
    left join messages m  on m.id = r.message_id
    left join players sp  on sp.id = m.sender_player_id
    left join profiles spr on spr.id = sp.user_id
    left join players rp  on rp.id = r.reporter_player_id
    left join profiles rpr on rpr.id = rp.user_id
    where p_status is null or r.status = p_status
  ) sub;
  return arr;
end $$;

-- ============================================================================
-- resolve_report (admin) — set status; optionally soft-delete the message.
-- ============================================================================
create or replace function resolve_report(
  p_report_id uuid, p_status text, p_delete_message boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_msg uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if not is_platform_admin(v_me) then raise exception 'not_admin'; end if;
  if p_status not in ('open','reviewed','actioned','dismissed') then
    raise exception 'status_invalid'; end if;

  update message_reports set status = p_status where id = p_report_id
    returning message_id into v_msg;

  if p_delete_message and v_msg is not null then
    update messages set deleted_at = now() where id = v_msg and deleted_at is null;
  end if;
end $$;

-- ============================================================================
-- Grants — reads/writes are SECURITY DEFINER; admin RPCs self-check is_platform_admin.
-- ============================================================================
revoke all on function is_platform_admin(uuid)                 from public;
revoke all on function list_announcements()                    from public;
revoke all on function mark_announcement_read(uuid)            from public;
revoke all on function publish_announcement(text, text, text, boolean) from public;
revoke all on function list_all_announcements()                from public;
revoke all on function list_message_reports(text)              from public;
revoke all on function resolve_report(uuid, text, boolean)     from public;

grant execute on function is_platform_admin(uuid)                 to authenticated;
grant execute on function list_announcements()                    to authenticated;
grant execute on function mark_announcement_read(uuid)            to authenticated;
grant execute on function publish_announcement(text, text, text, boolean) to authenticated;
grant execute on function list_all_announcements()                to authenticated;
grant execute on function list_message_reports(text)              to authenticated;
grant execute on function resolve_report(uuid, text, boolean)     to authenticated;

-- ============================================================================
-- SMOKE TESTS (impersonate a user — see the W1 file's header for the shim)
--   -- as the seeded admin:
--   select is_platform_admin();                                   -- expect true
--   select publish_announcement('Welcome', 'Chat is live!', 'promo', true);
--   select list_all_announcements();                              -- incl. drafts
--   select list_message_reports();                                -- the queue
--   -- as a normal user:
--   select list_announcements();                                  -- published only
--   select is_platform_admin();                                   -- expect false
-- ============================================================================
