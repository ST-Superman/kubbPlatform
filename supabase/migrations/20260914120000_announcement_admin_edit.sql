-- Kubb Platform — Messaging W3.1: edit / publish-toggle / delete announcements
--
--   Adds the admin management RPCs the /admin/announcements UI needs beyond create:
--   update fields, publish/unpublish, and delete. All admin-gated (is_platform_admin),
--   same as publish_announcement.
--
--   NOTE: applied MANUALLY — paste into the Supabase SQL editor and run.
--
-- Depends on: 20260913150000_messaging_w3_announcements.sql (announcements,
--   announcement_reads, is_platform_admin).

-- ============================================================================
-- update_announcement (admin) — edit title / body / severity in place.
--   Leaves published_at untouched (use set_announcement_published to change it).
-- ============================================================================
create or replace function update_announcement(
  p_id uuid, p_title text, p_body text, p_severity text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if not is_platform_admin(v_me) then raise exception 'not_admin'; end if;
  if p_title is null or char_length(btrim(p_title)) < 1 or char_length(p_title) > 200 then
    raise exception 'title_range'; end if;
  if p_body is null or char_length(btrim(p_body)) < 1 or char_length(p_body) > 8000 then
    raise exception 'body_range'; end if;
  if p_severity not in ('promo','critical') then raise exception 'severity_invalid'; end if;

  update announcements
     set title = btrim(p_title), body = btrim(p_body), severity = p_severity
   where id = p_id;
  if not found then raise exception 'announcement_not_found'; end if;
end $$;

-- ============================================================================
-- set_announcement_published (admin) — publish a draft (now) or unpublish.
-- ============================================================================
create or replace function set_announcement_published(p_id uuid, p_publish boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if not is_platform_admin(v_me) then raise exception 'not_admin'; end if;
  update announcements
     set published_at = case when p_publish then now() else null end
   where id = p_id;
  if not found then raise exception 'announcement_not_found'; end if;
end $$;

-- ============================================================================
-- delete_announcement (admin) — remove it (cascades announcement_reads).
-- ============================================================================
create or replace function delete_announcement(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if not is_platform_admin(v_me) then raise exception 'not_admin'; end if;
  delete from announcements where id = p_id;
end $$;

-- ============================================================================
-- Grants (self-check is_platform_admin inside)
-- ============================================================================
revoke all on function update_announcement(uuid, text, text, text) from public;
revoke all on function set_announcement_published(uuid, boolean)   from public;
revoke all on function delete_announcement(uuid)                    from public;

grant execute on function update_announcement(uuid, text, text, text) to authenticated;
grant execute on function set_announcement_published(uuid, boolean)   to authenticated;
grant execute on function delete_announcement(uuid)                   to authenticated;

-- ============================================================================
-- SMOKE TESTS (impersonate the admin — see the W1 file header for the shim)
--   select update_announcement('<id>', 'New title', 'New body', 'promo');
--   select set_announcement_published('<id>', false);   -- unpublish
--   select set_announcement_published('<id>', true);    -- publish now
--   select delete_announcement('<id>');
-- ============================================================================
