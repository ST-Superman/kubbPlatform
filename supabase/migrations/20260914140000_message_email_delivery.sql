-- Kubb Platform — Messaging: DM email delivery (daily / weekly digests)
--
--   Digest-only (no per-message "instant" email — too spammy in an active thread):
--     pg_cron (daily / Saturday) → dispatch_message_digest(cadence)
--       → net.http_post → notify-message Edge Function → message_digest_payload → Resend
--
--   Honors notification_prefs.dm_email_cadence ('in_app' | 'daily' | 'weekly'),
--   blocks, and soft-deletes. Recipient email lives in auth.users, so the payload
--   RPC is service_role and resolved inside the Edge Function.
--
--   NOTE: applied MANUALLY. After running, do the ONE-TIME SETUP at the bottom
--   (deploy the Edge Function, store the Vault URL, enable pg_cron + schedule).
--
-- Depends on: 20260913120000_messaging_w1.sql, 20260914130000_dm_email_cadence.sql,
--   20260909120000_notification_prefs...sql (notification_prefs.unsub_token, pg_net).

-- Clean up the earlier "instant" design if it was ever applied (safe no-ops otherwise).
drop trigger if exists on_message_notify on messages;
drop function if exists notify_message_created();
drop function if exists message_email_payload(uuid);

-- ============================================================================
-- message_digest_payload (service_role) — users on p_cadence WITH unread, + recap.
-- ============================================================================
create or replace function message_digest_payload(p_cadence text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare users jsonb;
begin
  if p_cadence not in ('daily', 'weekly') then
    return jsonb_build_object('kind', 'digest', 'cadence', p_cadence, 'users', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(u_row), '[]'::jsonb) into users
  from (
    select jsonb_build_object(
      'to_email', au.email,
      'to_name', pl.display_name,
      'unsub_token', np.unsub_token,
      'total_unread', ud.total_unread,
      'conversations', ud.conversations
    ) as u_row
    from notification_prefs np
    join auth.users au on au.id = np.user_id
    join players pl    on pl.user_id = np.user_id
    join lateral (
      select
        sum(x.unread)::int as total_unread,
        coalesce(jsonb_agg(jsonb_build_object(
          'label', x.label, 'unread', x.unread, 'last_body', x.last_body, 'last_at', x.last_at)
          order by x.last_at desc), '[]'::jsonb) as conversations
      from (
        select
          c.id,
          case c.type
            when 'group' then coalesce(c.title, 'Group')
            when 'match' then 'Match chat'
            else coalesce((select op.display_name from conversation_members om
                           join players op on op.id = om.player_id
                           where om.conversation_id = c.id and om.player_id <> pl.id limit 1), 'Player')
          end as label,
          (select count(*) from messages msg
             where msg.conversation_id = c.id and msg.deleted_at is null
               and msg.sender_player_id <> pl.id
               and (cm.last_read_at is null or msg.created_at > cm.last_read_at)
               and not exists (select 1 from player_blocks b
                    where b.blocker_player_id = pl.id and b.blocked_player_id = msg.sender_player_id)
          ) as unread,
          (select msg.body from messages msg
             where msg.conversation_id = c.id and msg.deleted_at is null
             order by msg.created_at desc limit 1) as last_body,
          (select msg.created_at from messages msg
             where msg.conversation_id = c.id order by msg.created_at desc limit 1) as last_at
        from conversation_members cm
        join conversations c on c.id = cm.conversation_id
        where cm.player_id = pl.id
      ) x
      where x.unread > 0
    ) ud on true
    where np.dm_email_cadence = p_cadence
      and au.email is not null
      and ud.total_unread > 0
  ) sub;

  return jsonb_build_object('kind', 'digest', 'cadence', p_cadence, 'users', users);
end $$;

-- ============================================================================
-- unsubscribe_messages_by_token — one-click "turn off message emails" (→ in_app).
--   Separate from unsubscribe_by_token (which is challenge emails). Anon-callable.
-- ============================================================================
create or replace function unsubscribe_messages_by_token(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_hit int;
begin
  if p_token is null then return jsonb_build_object('ok', false); end if;
  update notification_prefs set dm_email_cadence = 'in_app', updated_at = now()
   where unsub_token = p_token;
  get diagnostics v_hit = row_count;
  return jsonb_build_object('ok', v_hit > 0);
end $$;

-- ============================================================================
-- dispatch_message_digest — kicks the Edge Function for a cadence (called by pg_cron).
--   Best-effort; reads config from Vault (no-ops until notify_message_url is set).
-- ============================================================================
create or replace function dispatch_message_digest(p_cadence text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_message_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null or v_url = '' then return; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || coalesce(v_secret, '')),
    body    := jsonb_build_object('cadence', p_cadence));
exception when others then null;
end $$;

-- ============================================================================
-- Grants
-- ============================================================================
revoke all on function message_digest_payload(text)          from public;
revoke all on function unsubscribe_messages_by_token(uuid)    from public;
revoke all on function dispatch_message_digest(text)          from public;

grant execute on function message_digest_payload(text)        to service_role;
grant execute on function unsubscribe_messages_by_token(uuid) to anon, authenticated;
grant execute on function dispatch_message_digest(text)       to service_role;

-- ============================================================================
-- ONE-TIME SETUP (run after deploying the notify-message Edge Function)
--
-- 1) Deploy the function:
--      supabase functions deploy notify-message --no-verify-jwt
--    Secrets it needs (reuse the challenge ones): RESEND_API_KEY, NOTIFY_SECRET,
--    MAIL_FROM, SITE_URL. (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected.)
--
-- 2) Tell the DB where the function is (reuses the existing notify_secret):
--      select vault.create_secret(
--        'https://<PROJECT_REF>.functions.supabase.co/notify-message', 'notify_message_url');
--    (If it already exists: vault.update_secret((select id from vault.secrets
--      where name='notify_message_url'), 'https://.../notify-message');)
--
-- 3) Enable pg_cron (Supabase Dashboard → Database → Extensions → pg_cron), then
--    schedule the digests. Times are UTC — adjust to your audience. Saturday = dow 6.
--      select cron.schedule('message-digest-daily',  '0 13 * * *',
--              $$ select dispatch_message_digest('daily'); $$);
--      select cron.schedule('message-digest-weekly', '0 13 * * 6',
--              $$ select dispatch_message_digest('weekly'); $$);
--    Re-run? unschedule first:  select cron.unschedule('message-digest-daily');
--
-- SMOKE TEST (service_role / SQL editor):
--   select message_digest_payload('daily');     -- users with unread on daily
-- ============================================================================
