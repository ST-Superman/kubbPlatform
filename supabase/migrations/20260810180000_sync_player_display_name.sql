-- Kubb Platform — sync a user's display name onto their linked player row
--   Match cards read players.display_name, but the edit-profile form only wrote
--   profiles.display_name — so renames never showed up in matches. players has no
--   owner-update RLS policy (all writes go via RPCs), so this SECURITY DEFINER
--   function updates only the caller's own linked player row.
--
-- Apply with: supabase db push

create or replace function set_my_display_name(p_display_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  update players set display_name = p_display_name where user_id = v_uid;
end $$;

revoke all on function set_my_display_name(text) from public;
grant execute on function set_my_display_name(text) to authenticated;
