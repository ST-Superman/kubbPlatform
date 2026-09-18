-- Kubb Platform — Messaging i2: APNs remote push for new messages
--
--   The instant channel (email stays digest-only). On every new message:
--     messages INSERT → notify_message_push() trigger → net.http_post →
--       notify-push Edge Function → message_push_payload → APNs (api.push.apple.com)
--
--   Honors a new per-user pref (notification_prefs.dm_push), block relationships, and
--   soft-deletes. Device tokens are registered by the iOS client via RPC; recipient
--   resolution (which needs OTHER users' tokens) runs service_role inside the function.
--
--   NOTE: applied MANUALLY. Dormant until the notify-push function is deployed, its
--   Vault url (notify_push_url) is set, and the APNs secrets are configured — see the
--   runbook at the bottom.
--
-- Depends on: 20260913120000_messaging_w1.sql (conversations/messages/conversation_members,
--   player_blocks), setup_identity.sql (players), notification_prefs, pg_net.

-- ============================================================================
-- device_tokens — one row per APNs device token, keyed to the auth user.
-- ============================================================================
create table if not exists device_tokens (
  token       text primary key,                        -- APNs hex token (device+app+env)
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null default 'ios',
  environment text not null default 'production'
              check (environment in ('production','sandbox')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists device_tokens_user_idx on device_tokens (user_id);

alter table device_tokens enable row level security;
-- Own-row read only; writes go through the RPCs below (RPC-only, like match_tokens).
drop policy if exists device_tokens_select on device_tokens;
create policy device_tokens_select on device_tokens for select to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- notification_prefs.dm_push — per-user push opt-in (default on).
-- ============================================================================
alter table notification_prefs
  add column if not exists dm_push boolean not null default true;

-- ============================================================================
-- register_device_token / unregister_device_token (self, RPC-only writes)
-- ============================================================================
create or replace function register_device_token(
  p_token text, p_platform text default 'ios', p_environment text default 'production')
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if p_token is null or char_length(p_token) < 8 then raise exception 'token_invalid'; end if;
  insert into device_tokens (token, user_id, platform, environment, updated_at)
  values (p_token, v_me, coalesce(p_platform,'ios'),
          case when p_environment in ('production','sandbox') then p_environment else 'production' end,
          now())
  on conflict (token) do update
    set user_id = excluded.user_id,           -- re-bind if the device changed accounts
        platform = excluded.platform,
        environment = excluded.environment,
        updated_at = now();
end $$;

create or replace function unregister_device_token(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'auth_required'; end if;
  delete from device_tokens where token = p_token and user_id = v_me;
end $$;

-- ============================================================================
-- my_message_prefs / set_message_prefs — now also carry dm_push.
--   (Drop the 5-arg set signature first so there's no overload ambiguity.)
-- ============================================================================
create or replace function my_message_prefs()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); r record;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  insert into notification_prefs (user_id) values (v_me) on conflict (user_id) do nothing;
  select dm_policy, dm_emails, allow_group_add, announcement_promo, dm_email_cadence, dm_push
    into r from notification_prefs where user_id = v_me;
  return jsonb_build_object(
    'dm_policy',          coalesce(r.dm_policy, 'eligible'),
    'dm_emails',          coalesce(r.dm_emails, true),
    'allow_group_add',    coalesce(r.allow_group_add, true),
    'announcement_promo', coalesce(r.announcement_promo, true),
    'dm_email_cadence',   coalesce(r.dm_email_cadence, 'in_app'),
    'dm_push',            coalesce(r.dm_push, true));
end $$;

drop function if exists set_message_prefs(text, boolean, boolean, boolean, text);

create or replace function set_message_prefs(
  p_dm_policy text default null,
  p_dm_emails boolean default null,
  p_allow_group_add boolean default null,
  p_announcement_promo boolean default null,
  p_dm_email_cadence text default null,
  p_dm_push boolean default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if p_dm_policy is not null and p_dm_policy not in ('eligible','none') then
    raise exception 'dm_policy_invalid';
  end if;
  if p_dm_email_cadence is not null
     and p_dm_email_cadence not in ('in_app','daily','weekly') then
    raise exception 'dm_cadence_invalid';
  end if;
  insert into notification_prefs (user_id) values (v_me) on conflict (user_id) do nothing;
  update notification_prefs set
    dm_policy          = coalesce(p_dm_policy, dm_policy),
    dm_emails          = coalesce(p_dm_emails, dm_emails),
    allow_group_add    = coalesce(p_allow_group_add, allow_group_add),
    announcement_promo = coalesce(p_announcement_promo, announcement_promo),
    dm_email_cadence   = coalesce(p_dm_email_cadence, dm_email_cadence),
    dm_push            = coalesce(p_dm_push, dm_push),
    updated_at         = now()
  where user_id = v_me;
  return my_message_prefs();
end $$;

-- ============================================================================
-- message_push_payload (service_role) — recipients' tokens + the alert text.
--   Members except the sender, with dm_push on, not blocking the sender, and the
--   message still live. Title/body are uniform across recipients.
-- ============================================================================
create or replace function message_push_payload(p_message_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m record; v_type text; v_sender_name text; v_title text; v_body text; v_preview text;
  v_recipients jsonb;
begin
  select id, conversation_id, sender_player_id, body, deleted_at
    into m from messages where id = p_message_id;
  if m.id is null or m.deleted_at is not null then return null; end if;

  select type into v_type from conversations where id = m.conversation_id;
  select display_name into v_sender_name from players where id = m.sender_player_id;
  v_sender_name := coalesce(v_sender_name, 'A player');
  v_preview := left(m.body, 140);

  if v_type = 'dm' then
    v_title := v_sender_name;
    v_body  := v_preview;
  elsif v_type = 'match' then
    v_title := 'Match chat';
    v_body  := v_sender_name || ': ' || v_preview;
  else
    select coalesce(title, 'Group') into v_title from conversations where id = m.conversation_id;
    v_body  := v_sender_name || ': ' || v_preview;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('token', dt.token, 'environment', dt.environment)), '[]'::jsonb)
    into v_recipients
  from conversation_members cm
  join players p on p.id = cm.player_id
  join device_tokens dt on dt.user_id = p.user_id
  left join notification_prefs np on np.user_id = p.user_id
  where cm.conversation_id = m.conversation_id
    and cm.player_id <> m.sender_player_id
    and coalesce(np.dm_push, true) = true
    and not exists (
      select 1 from player_blocks b
      where b.blocker_player_id = cm.player_id and b.blocked_player_id = m.sender_player_id);

  return jsonb_build_object(
    'conversation_id', m.conversation_id,
    'title', v_title,
    'body',  v_body,
    'recipients', v_recipients);
end $$;

-- ============================================================================
-- notify_message_push — AFTER INSERT trigger; fires the Edge Function via pg_net.
--   Best-effort + Vault-gated: no-ops until notify_push_url is set, and any error is
--   swallowed so push can never break the message insert (same as the challenge path).
-- ============================================================================
create or replace function notify_message_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null or v_url = '' then return new; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer ' || coalesce(v_secret,'')),
    body    := jsonb_build_object('message_id', new.id));
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists on_message_push on messages;
create trigger on_message_push after insert on messages
  for each row execute function notify_message_push();

-- ============================================================================
-- Grants
-- ============================================================================
revoke all on function register_device_token(text, text, text)     from public;
revoke all on function unregister_device_token(text)                from public;
revoke all on function message_push_payload(uuid)                   from public;

grant execute on function register_device_token(text, text, text)   to authenticated;
grant execute on function unregister_device_token(text)             to authenticated;
grant execute on function message_push_payload(uuid)                to service_role;

-- ============================================================================
-- ONE-TIME SETUP (runbook)
--
-- 1) Apple: create an APNs Auth Key (.p8) in the Apple Developer portal
--    (Certificates, Identifiers & Profiles → Keys → +, enable Apple Push
--    Notifications service). Note the Key ID + your Team ID. The App ID already
--    has Push enabled (aps-environment=production in the app entitlements).
--
-- 2) Deploy the sender:
--      supabase functions deploy notify-push --no-verify-jwt
--    Secrets:
--      supabase secrets set NOTIFY_SECRET=<same as the other notify functions>
--      supabase secrets set APNS_KEY_ID=<10-char key id>
--      supabase secrets set APNS_TEAM_ID=<10-char team id>
--      supabase secrets set APNS_BUNDLE_ID=ST-Superman.Kubb-Coach   # main app target's Bundle ID (apns-topic)
--      supabase secrets set APNS_KEY="$(cat AuthKey_XXXXXXXXXX.p8)"   # full PEM
--      # optional: APNS_HOST=api.sandbox.push.apple.com to force sandbox while testing
--
-- 3) Point the trigger at the function (reuses notify_secret):
--      select vault.create_secret(
--        'https://<PROJECT_REF>.functions.supabase.co/notify-push', 'notify_push_url');
--    (update_secret if it already exists.)
--
-- SMOKE TEST (service_role / SQL editor): register a token from the device first, then
--   select message_push_payload('<a-recent-message-id>');   -- recipients + alert text
-- ============================================================================
