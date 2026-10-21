-- Core account, project, private draft media and intentionally public media.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  initial_scene_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null check (position >= 0),
  title text not null check (char_length(title) between 1 and 160),
  media_path text not null,
  public_media_path text,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  projection text not null check (projection in ('equirectangular', 'flat')),
  approximate boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, position)
);

alter table public.projects
  drop constraint if exists projects_initial_scene_id_fkey;
alter table public.projects
  add constraint projects_initial_scene_id_fkey
  foreign key (initial_scene_id) references public.scenes (id) on delete set null;

create table if not exists public.hotspots (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes (id) on delete cascade,
  yaw double precision not null check (yaw between -1000 and 1000),
  pitch double precision not null check (pitch between -1.571 and 1.571),
  title text not null default '' check (char_length(title) <= 160),
  description text not null default '' check (char_length(description) <= 4000),
  target_url text check (target_url is null or char_length(target_url) <= 2048),
  created_at timestamptz not null default now()
);

create index if not exists projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
create index if not exists scenes_project_position_idx on public.scenes (project_id, position);
create index if not exists hotspots_scene_idx on public.hotspots (scene_id);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.scenes enable row level security;
alter table public.hotspots enable row level security;

drop policy if exists "Profiles are readable by owner" on public.profiles;
create policy "Profiles are readable by owner" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Profiles are insertable by owner" on public.profiles;
create policy "Profiles are insertable by owner" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "Profiles are updateable by owner" on public.profiles;
create policy "Profiles are updateable by owner" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Owners manage their projects" on public.projects;
create policy "Owners manage their projects" on public.projects for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "Published project metadata is public" on public.projects;
create policy "Published project metadata is public" on public.projects for select to anon, authenticated using (status = 'published');

drop policy if exists "Owners manage scenes" on public.scenes;
create policy "Owners manage scenes" on public.scenes for all to authenticated using (
  exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
) with check (
  exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "Published scene metadata is public" on public.scenes;
create policy "Published scene metadata is public" on public.scenes for select to anon, authenticated using (
  exists (select 1 from public.projects p where p.id = project_id and p.status = 'published')
);

drop policy if exists "Owners manage hotspots" on public.hotspots;
create policy "Owners manage hotspots" on public.hotspots for all to authenticated using (
  exists (select 1 from public.scenes s join public.projects p on p.id = s.project_id where s.id = scene_id and p.owner_id = (select auth.uid()))
) with check (
  exists (select 1 from public.scenes s join public.projects p on p.id = s.project_id where s.id = scene_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "Published hotspot metadata is public" on public.hotspots;
create policy "Published hotspot metadata is public" on public.hotspots for select to anon, authenticated using (
  exists (select 1 from public.scenes s join public.projects p on p.id = s.project_id where s.id = scene_id and p.status = 'published')
);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.projects, public.scenes, public.hotspots to authenticated;
grant select on public.projects, public.scenes, public.hotspots to anon;

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
