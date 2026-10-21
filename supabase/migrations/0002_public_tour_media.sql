-- Upgrade an installation that already applied 0001 before cloud publishing.
alter table public.scenes add column if not exists public_media_path text;
alter table public.scenes add column if not exists approximate boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('vitrine360-private', 'vitrine360-private', false, 104857600, array['image/jpeg','image/png','image/webp','image/avif']),
  ('vitrine360-public', 'vitrine360-public', true, 104857600, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners manage private tour media" on storage.objects;
create policy "Owners manage private tour media" on storage.objects for all to authenticated
using (bucket_id = 'vitrine360-private' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'vitrine360-private' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owners manage published tour media" on storage.objects;
create policy "Owners manage published tour media" on storage.objects for all to authenticated
using (bucket_id = 'vitrine360-public' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'vitrine360-public' and (storage.foldername(name))[1] = (select auth.uid())::text);
