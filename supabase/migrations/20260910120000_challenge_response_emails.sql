-- Kubb Platform — accept / decline challenge emails
--   Extends the challenge-created pipeline so the CHALLENGER is notified when the
--   player they challenged accepts or declines. Same path as before
--   (trigger → pg_net → notify-challenge Edge Function → Resend); the function now
--   branches on an `event` field carried in the request body.
--
--   Depends on: 20260909120000_notification_prefs_and_challenge_email.sql.
--   Migrations here are applied MANUALLY — paste this whole file into the SQL editor.

-- ============================================================================
-- challenge_email_payload — now event-aware (replaces the 1-arg version).
--   created           → notify the challenged (to_player); other = challenger
--   accepted/declined → notify the challenger (from_player); other = responder
-- ============================================================================
drop function if exists challenge_email_payload(uuid);

create or replace function challenge_email_payload(p_challenge_id uuid, p_event text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c              record;
  v_recipient    uuid;   -- player row to notify
  v_other        uuid;   -- the other party in the challenge
  v_to_user      uuid;
  v_to_name      text;
  v_email        text;
  v_other_name   text;
  v_other_handle text;
  v_send         boolean;
  v_token        uuid;
begin
  select * into c from challenges where id = p_challenge_id;
  if c.id is null then return null; end if;

  if p_event = 'challenge_created' then
    v_recipient := c.to_player;   v_other := c.from_player;
  elsif p_event in ('challenge_accepted', 'challenge_declined') then
    v_recipient := c.from_player; v_other := c.to_player;
  else
    return null;
  end if;

  select p.user_id, p.display_name into v_to_user, v_to_name
    from players p where p.id = v_recipient;
  if v_to_user is null then return null; end if;   -- recipient has no account/email

  select email into v_email from auth.users where id = v_to_user;
  if v_email is null then return null; end if;

  select p.display_name, pr.handle::text into v_other_name, v_other_handle
    from players p
    left join profiles pr on pr.id = p.user_id
   where p.id = v_other;

  insert into notification_prefs (user_id) values (v_to_user)
    on conflict (user_id) do nothing;
  select challenge_emails, unsub_token into v_send, v_token
    from notification_prefs where user_id = v_to_user;

  return jsonb_build_object(
    'event',        p_event,
    'challenge_id', c.id,
    'match_id',     c.match_id,      -- populated when accepted
    'status',       c.status,
    'send',         coalesce(v_send, true),
    'to_email',     v_email,
    'to_name',      v_to_name,
    'other_name',   v_other_name,
    'other_handle', v_other_handle,
    'race_to',      c.race_to,
    'unsub_token',  v_token
  );
end $$;

revoke all on function challenge_email_payload(uuid, text) from public;
grant execute on function challenge_email_payload(uuid, text) to service_role;

-- ============================================================================
-- created trigger — carry the event in the body (payload is now 2-arg).
-- ============================================================================
create or replace function notify_challenge_created()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if new.status <> 'pending' then return new; end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_challenge_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null or v_url = '' then return new; end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || coalesce(v_secret, '')),
    body    := jsonb_build_object('challenge_id', new.id, 'event', 'challenge_created')
  );
  return new;
exception when others then
  return new;
end $$;

-- ============================================================================
-- responded trigger — fire on the accept/decline status transition.
--   Cancelled (challenger withdrew their own) sends nothing.
-- ============================================================================
create or replace function notify_challenge_responded()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text; v_event text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'accepted' then v_event := 'challenge_accepted';
  elsif new.status = 'declined' then v_event := 'challenge_declined';
  else return new; end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_challenge_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null or v_url = '' then return new; end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || coalesce(v_secret, '')),
    body    := jsonb_build_object('challenge_id', new.id, 'event', v_event)
  );
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists on_challenge_responded on challenges;
create trigger on_challenge_responded
  after update of status on challenges
  for each row execute function notify_challenge_responded();
