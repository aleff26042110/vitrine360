-- Public creator profiles are opt-in and exposed through a narrow manifest RPC.
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists website_url text;
alter table public.profiles add column if not exists public_slug text;
alter table public.profiles add column if not exists is_public boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_bio_length_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_bio_length_check check (char_length(bio) <= 600);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_website_url_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_website_url_check
      check (website_url is null or (char_length(website_url) <= 2048 and website_url ~ '^https?://[^[:space:]]+$'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_public_slug_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_public_slug_check
      check (public_slug is null or public_slug ~ '^[a-z0-9][a-z0-9-]{2,59}$');
  end if;
end;
$$;

create unique index if not exists profiles_public_slug_unique_idx
  on public.profiles (public_slug) where public_slug is not null;

create or replace function public.load_public_profile(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'slug', p.public_slug,
    'display_name', coalesce(nullif(p.display_name, ''), 'Criador'),
    'bio', p.bio,
    'website_url', p.website_url
  )
  from public.profiles p
  where p.public_slug = p_slug and p.is_public = true
  limit 1;
$$;
revoke all on function public.load_public_profile(text) from public;
grant execute on function public.load_public_profile(text) to anon, authenticated;
