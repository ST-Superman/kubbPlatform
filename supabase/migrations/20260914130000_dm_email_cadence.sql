-- Kubb Platform — Messaging: DM email cadence preference
--
--   Replaces the unused boolean dm_emails with a cadence the user controls:
--     'in_app' — no emails; unread badge + Messages tab only         (DEFAULT)
--     'daily'  — one daily recap email of unread messages
--     'weekly' — one weekly (Saturday) recap of unread messages
--
--   This migration only adds the PREFERENCE + its read/write RPCs. Delivery (the
--   digest scheduler + Edge Function) is a separate migration.
--
--   NOTE: applied MANUALLY — paste into the Supabase SQL editor and run.
--
-- Depends on: 20260913120000_messaging_w1.sql (notification_prefs messaging columns,
--   my_message_prefs / set_message_prefs).

alter table notification_prefs
  add column if not exists dm_email_cadence text not null default 'in_app';

-- Normalize any legacy 'instant' value, then (re)assert the allowed set. Drop-then-add
-- makes this correct whether or not an earlier (4-way) constraint was already applied.
update notification_prefs set dm_email_cadence = 'in_app' where dm_email_cadence = 'instant';
alter table notification_prefs drop constraint if exists notification_prefs_dm_cadence_chk;
alter table notification_prefs
  add constraint notification_prefs_dm_cadence_chk
    check (dm_email_cadence in ('in_app','daily','weekly'));

-- ============================================================================
-- my_message_prefs — now also returns dm_email_cadence.
-- ============================================================================
create or replace function my_message_prefs()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); r record;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  insert into notification_prefs (user_id) values (v_me) on conflict (user_id) do nothing;
  select dm_policy, dm_emails, allow_group_add, announcement_promo, dm_email_cadence
    into r from notification_prefs where user_id = v_me;
  return jsonb_build_object(
    'dm_policy',          coalesce(r.dm_policy, 'eligible'),
    'dm_emails',          coalesce(r.dm_emails, true),
    'allow_group_add',    coalesce(r.allow_group_add, true),
    'announcement_promo', coalesce(r.announcement_promo, true),
    'dm_email_cadence',   coalesce(r.dm_email_cadence, 'in_app'));
end $$;

-- ============================================================================
-- set_message_prefs — add p_dm_email_cadence. Drop the old 4-arg signature first
--   so there's a single (no overload ambiguity); every field is optional.
-- ============================================================================
drop function if exists set_message_prefs(text, boolean, boolean, boolean);

create or replace function set_message_prefs(
  p_dm_policy text default null,
  p_dm_emails boolean default null,
  p_allow_group_add boolean default null,
  p_announcement_promo boolean default null,
  p_dm_email_cadence text default null)
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
    updated_at         = now()
  where user_id = v_me;
  return my_message_prefs();
end $$;

revoke all on function set_message_prefs(text, boolean, boolean, boolean, text) from public;
grant execute on function set_message_prefs(text, boolean, boolean, boolean, text) to authenticated;

-- ============================================================================
-- SMOKE TEST (impersonate a user — see W1 header for the shim)
--   select set_message_prefs(p_dm_email_cadence => 'daily');
--   select my_message_prefs();   -- dm_email_cadence: 'daily'
-- ============================================================================
