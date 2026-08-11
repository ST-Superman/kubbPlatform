-- Kubb Platform — avatar uploads (PR-5)
--   Public "avatars" bucket. Each user may write only within their own {uid}/ folder;
--   anyone may read. The app stores one object per user (uid/avatar.webp, upserted),
--   so there are no orphans to clean up.
--
-- Apply with: supabase db push (or run in the SQL editor)

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read"  on storage.objects;
drop policy if exists "avatars_owner_insert" on storage.objects;
drop policy if exists "avatars_owner_update" on storage.objects;
drop policy if exists "avatars_owner_delete" on storage.objects;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
