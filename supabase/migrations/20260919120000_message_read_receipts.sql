-- Kubb Platform — Pass 3 (Q6): read_receipts preference
--
--   Gates the typing indicator + seen receipts, BOTH directions: if you don't
--   broadcast yours, you don't see theirs. Default ON. No new tables — typing rides
--   the conv:<id> broadcast and "seen" reuses mark_read; this only adds the pref.
--
--   NOTE: applied MANUALLY — paste into the Supabase SQL editor and run. The web
--   client bumps set_message_prefs to 7 args, so this must land with that deploy or
--   every preference save errors (dm_cadence_invalid-style resolution failure).

alter table notification_prefs
  add column if not exists read_receipts boolean not null default true;

-- my_message_prefs: also return read_receipts (create-or-replace keeps grants).
create or replace function my_message_prefs()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); r record;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  insert into notification_prefs (user_id) values (v_me) on conflict (user_id) do nothing;
  select dm_policy, dm_emails, allow_group_add, announcement_promo, dm_email_cadence, dm_push, read_receipts
    into r from notification_prefs where user_id = v_me;
  return jsonb_build_object(
    'dm_policy',          coalesce(r.dm_policy, 'eligible'),
    'dm_emails',          coalesce(r.dm_emails, true),
    'allow_group_add',    coalesce(r.allow_group_add, true),
    'announcement_promo', coalesce(r.announcement_promo, true),
    'dm_email_cadence',   coalesce(r.dm_email_cadence, 'in_app'),
    'dm_push',            coalesce(r.dm_push, true),
    'read_receipts',      coalesce(r.read_receipts, true));
end $$;

-- set_message_prefs: add p_read_receipts. A defaulted trailing param can't be added
-- in place, so drop the current 6-arg signature first, then recreate at 7 args.
drop function if exists set_message_prefs(text, boolean, boolean, boolean, text, boolean);

create or replace function set_message_prefs(
  p_dm_policy text default null,
  p_dm_emails boolean default null,
  p_allow_group_add boolean default null,
  p_announcement_promo boolean default null,
  p_dm_email_cadence text default null,
  p_dm_push boolean default null,
  p_read_receipts boolean default null)
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
    read_receipts      = coalesce(p_read_receipts, read_receipts),
    updated_at         = now()
  where user_id = v_me;
  return my_message_prefs();
end $$;

-- Client-facing, self-scoped on auth.uid() — authenticated only (matches the
-- 2026-09-18 grant hardening; the fresh CREATE would otherwise default to anon too).
revoke all on function set_message_prefs(text, boolean, boolean, boolean, text, boolean, boolean) from public, anon;
grant execute on function set_message_prefs(text, boolean, boolean, boolean, text, boolean, boolean) to authenticated;

-- Smoke:
--   select set_message_prefs(p_read_receipts => false);
--   select (my_message_prefs())->>'read_receipts';   -- 'false'
--   select set_message_prefs(p_read_receipts => true);
