-- Kubb Platform — onboarding (collect display name + handle)
--   Signup now captures a real handle + display name. The handle_new_user trigger
--   already reads raw_user_meta_data; we add an onboarded_at marker so OAuth/legacy
--   users (no metadata) get a one-time "finish your profile" step.
--
-- Apply with: supabase db push

alter table profiles add column if not exists onboarded_at timestamptz;

-- Existing accounts are considered onboarded (don't force them through the step).
update profiles set onboarded_at = created_at where onboarded_at is null;

-- Trigger: mark onboarded when signup metadata carried a handle (email/password
-- form). OAuth signups have no metadata → onboarded_at stays null.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_handle citext;
begin
  v_handle := coalesce(new.raw_user_meta_data->>'handle',
                       split_part(new.email, '@', 1) || '-' || left(new.id::text, 4));
  insert into profiles (id, handle, display_name, onboarded_at)
  values (new.id, v_handle,
          coalesce(new.raw_user_meta_data->>'display_name', v_handle),
          case when new.raw_user_meta_data ? 'handle' then now() end)
  on conflict (id) do nothing;

  insert into players (user_id, display_name, created_by, claimed_at)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', v_handle), new.id, now())
  on conflict (user_id) do nothing;
  return new;
end $$;

-- Is a handle free? (case-insensitive via citext). Used by the signup form pre-auth.
create or replace function handle_available(p_handle citext) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where handle = p_handle);
$$;

-- Finish/confirm profile: set handle + display name and mark onboarded.
create or replace function complete_onboarding(p_handle citext, p_display_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_handle citext := lower(p_handle::text)::citext;
  v_name text := trim(p_display_name);
begin
  if v_uid is null then raise exception 'auth_required'; end if;
  if lower(p_handle::text) !~ '^[a-z0-9_]{3,30}$' then raise exception 'handle_invalid'; end if;
  if v_name is null or length(v_name) = 0 then raise exception 'display_required'; end if;

  begin
    update profiles
       set handle = v_handle, display_name = v_name, onboarded_at = now()
     where id = v_uid;
  exception when unique_violation then
    raise exception 'handle_taken';
  end;

  update players set display_name = v_name where user_id = v_uid;
end $$;

revoke all on function handle_available(citext)         from public;
revoke all on function complete_onboarding(citext, text) from public;
grant execute on function handle_available(citext)         to anon, authenticated;
grant execute on function complete_onboarding(citext, text) to authenticated;
