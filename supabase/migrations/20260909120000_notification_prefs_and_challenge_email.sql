-- Kubb Platform — challenge email notifications + notification preferences
--   When an ACCOUNT opponent is challenged, create_challenge inserts a pending
--   `challenges` row (managed opponents spawn a match directly and are never emailed).
--   This migration turns that INSERT into an email:
--
--     challenges INSERT (pending)  →  notify_challenge_created() trigger
--       →  net.http_post (pg_net, fire-and-forget)  →  notify-challenge Edge Function
--       →  challenge_email_payload(id)  →  Resend
--
--   pg_net makes the HTTP call asynchronous, so a mail/config problem can NEVER
--   block or fail challenge creation (the whole point of using it over a sync call).
--
--   Also adds notification_prefs: a per-user opt-out (honored before send) plus a
--   stable one-tap unsubscribe token for the List-Unsubscribe header + footer link.
--
--   NOTE: this project's migrations are applied MANUALLY — paste this whole file into
--   the Supabase SQL editor and run it. After running, set the two DB settings the
--   trigger reads (see the bottom of this file).
--
-- Depends on: setup_identity.sql (profiles, players), 20260810200000_challenges.sql.

create extension if not exists pg_net;

-- ============================================================================
-- notification_prefs — per-user email preferences (writes via RPC only)
-- ============================================================================
create table if not exists notification_prefs (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  challenge_emails boolean not null default true,
  unsub_token      uuid    not null default gen_random_uuid(),
  updated_at       timestamptz not null default now()
);

alter table notification_prefs enable row level security;

-- Own-row read only. The unsub_token is a secret (one-tap unsubscribe key), so it
-- must never be readable for anyone else. Writes go through the RPCs below.
drop policy if exists notif_prefs_select on notification_prefs;
create policy notif_prefs_select on notification_prefs for select to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- my_notification_prefs — read (and lazily provision) the caller's prefs
-- ============================================================================
create or replace function my_notification_prefs()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_on boolean;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  insert into notification_prefs (user_id) values (v_me)
    on conflict (user_id) do nothing;
  select challenge_emails into v_on from notification_prefs where user_id = v_me;
  return jsonb_build_object('challenge_emails', coalesce(v_on, true));
end $$;

-- ============================================================================
-- set_challenge_emails — the in-app toggle (self only)
-- ============================================================================
create or replace function set_challenge_emails(p_on boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'auth_required'; end if;
  insert into notification_prefs (user_id, challenge_emails, updated_at)
  values (v_me, coalesce(p_on, true), now())
  on conflict (user_id)
    do update set challenge_emails = excluded.challenge_emails, updated_at = now();
  return jsonb_build_object('challenge_emails', coalesce(p_on, true));
end $$;

-- ============================================================================
-- unsubscribe_by_token — one-tap unsubscribe (works logged-out; anon-callable)
--   Used by the List-Unsubscribe header and the footer link. Returns whether a
--   matching prefs row was found (never reveals which user).
-- ============================================================================
create or replace function unsubscribe_by_token(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_hit int;
begin
  if p_token is null then return jsonb_build_object('ok', false); end if;
  update notification_prefs
     set challenge_emails = false, updated_at = now()
   where unsub_token = p_token;
  get diagnostics v_hit = row_count;
  return jsonb_build_object('ok', v_hit > 0);
end $$;

-- ============================================================================
-- challenge_email_payload — everything the Edge Function needs, resolved
--   server-side (recipient email lives in auth.users → service_role only).
--   Ensures a prefs row exists so the unsubscribe token is stable, and returns
--   `send` = the recipient's current opt-in. NULL when there's nothing to send
--   (challenge gone/not pending, or opponent is a managed player with no account).
-- ============================================================================
create or replace function challenge_email_payload(p_challenge_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c            record;
  v_to_user    uuid;
  v_to_name    text;
  v_to_handle  text;
  v_email      text;
  v_from_name  text;
  v_from_handle text;
  v_send       boolean;
  v_token      uuid;
begin
  select * into c from challenges where id = p_challenge_id and status = 'pending';
  if c.id is null then return null; end if;

  -- Recipient must be an account (managed opponents never reach a pending row).
  select p.user_id, p.display_name into v_to_user, v_to_name
    from players p where p.id = c.to_player;
  if v_to_user is null then return null; end if;

  select email into v_email from auth.users where id = v_to_user;
  if v_email is null then return null; end if;

  select handle::text into v_to_handle from profiles where id = v_to_user;

  select p.display_name, pr.handle::text into v_from_name, v_from_handle
    from players p
    left join profiles pr on pr.id = p.user_id
   where p.id = c.from_player;

  -- Ensure a prefs row (stable unsub token) and read the effective opt-in.
  insert into notification_prefs (user_id) values (v_to_user)
    on conflict (user_id) do nothing;
  select challenge_emails, unsub_token into v_send, v_token
    from notification_prefs where user_id = v_to_user;

  return jsonb_build_object(
    'challenge_id', c.id,
    'send',         coalesce(v_send, true),
    'to_email',     v_email,
    'to_name',      v_to_name,
    'to_handle',    v_to_handle,
    'from_name',    v_from_name,
    'from_handle',  v_from_handle,
    'race_to',      c.race_to,
    'unsub_token',  v_token
  );
end $$;

-- ============================================================================
-- notify_challenge_created — AFTER INSERT trigger; fires the Edge Function.
--   Reads config from Vault; if unset it silently no-ops. Any error is swallowed
--   so email delivery can never break the challenge insert. (Vault, not ALTER
--   DATABASE SET — the hosted `postgres` role can't set custom DB parameters.)
-- ============================================================================
create or replace function notify_challenge_created()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if new.status <> 'pending' then return new; end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_challenge_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null or v_url = '' then return new; end if;   -- not configured yet

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || coalesce(v_secret, '')),
    body    := jsonb_build_object('challenge_id', new.id)
  );
  return new;
exception when others then
  return new;   -- never let a mail problem roll back the challenge
end $$;

drop trigger if exists on_challenge_created on challenges;
create trigger on_challenge_created
  after insert on challenges
  for each row execute function notify_challenge_created();

-- ============================================================================
-- Grants
-- ============================================================================
revoke all on function my_notification_prefs()          from public;
revoke all on function set_challenge_emails(boolean)     from public;
revoke all on function unsubscribe_by_token(uuid)        from public;
revoke all on function challenge_email_payload(uuid)     from public;

grant execute on function my_notification_prefs()      to authenticated;
grant execute on function set_challenge_emails(boolean) to authenticated;
grant execute on function unsubscribe_by_token(uuid)   to anon, authenticated;
grant execute on function challenge_email_payload(uuid) to service_role;

-- ============================================================================
-- ONE-TIME SETUP (run after the Edge Function is deployed)
--   Store the function URL + shared secret in Vault (the trigger reads these).
--   Replace <PROJECT_REF> and <SECRET>; <SECRET> must equal the function's
--   NOTIFY_SECRET env. Vault is used because the hosted `postgres` role cannot
--   ALTER DATABASE SET a custom parameter (ERROR 42501).
--
--   create extension if not exists supabase_vault with schema vault;
--   select vault.create_secret(
--     'https://<PROJECT_REF>.functions.supabase.co/notify-challenge', 'notify_challenge_url');
--   select vault.create_secret('<SECRET>', 'notify_secret');
--
--   Verify:  select name from vault.secrets
--              where name in ('notify_challenge_url','notify_secret');
--   Re-run?  a name is unique — update instead of re-creating:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'notify_secret'), '<NEW_SECRET>');
-- ============================================================================
