-- Kubb Platform — Messaging: admin "send test digest" trigger
--
--   Lets an admin fire a digest run on demand (from the UI) instead of waiting for
--   the pg_cron schedule. Runs the SAME path cron uses (dispatch_message_digest →
--   notify-message → Resend), so it emails every user on that cadence who has unread
--   — it's an early run of the real job, not a private preview.
--
--   NOTE: applied MANUALLY — paste into the Supabase SQL editor and run.
--
-- Depends on: 20260913150000_messaging_w3_announcements.sql (is_platform_admin),
--   20260914140000_message_email_delivery.sql (dispatch_message_digest).

create or replace function admin_send_test_digest(p_cadence text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if not is_platform_admin(v_me) then raise exception 'not_admin'; end if;
  if p_cadence not in ('daily','weekly') then raise exception 'cadence_invalid'; end if;
  perform dispatch_message_digest(p_cadence);   -- fire-and-forget via pg_net
  return jsonb_build_object('ok', true, 'cadence', p_cadence);
end $$;

revoke all on function admin_send_test_digest(text) from public;
grant execute on function admin_send_test_digest(text) to authenticated;

-- ============================================================================
-- SMOKE TEST (impersonate the admin — see W1 header for the shim)
--   select admin_send_test_digest('daily');   -- {ok:true}; check notify-message logs
-- ============================================================================
