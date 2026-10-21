create table if not exists public.floorplans (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  rooms jsonb not null default '[]'::jsonb check (jsonb_typeof(rooms) = 'array' and jsonb_array_length(rooms) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.floorplans enable row level security;
drop policy if exists "Owners manage floorplans" on public.floorplans;
create policy "Owners manage floorplans" on public.floorplans for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
grant select, insert, update, delete on public.floorplans to authenticated;
