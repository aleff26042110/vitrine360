-- Expand the schema for product spins, models, provider jobs, publications,
-- privacy-aware analytics and server-enforced usage accounting.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_id_owner_key' and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects add constraint projects_id_owner_key unique (id, owner_id);
  end if;
end;
$$;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid,
  storage_bucket text not null,
  storage_path text not null,
  asset_kind text not null check (asset_kind in ('image', 'panorama', 'video', 'spin_frame', 'model_glb', 'gaussian_splat', 'thumbnail', 'archive')),
  original_name text not null check (char_length(original_name) <= 255),
  mime_type text not null check (char_length(mime_type) <= 127),
  byte_size bigint not null check (byte_size > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  asset_status text not null default 'ready' check (asset_status in ('temporary', 'ready', 'deleting', 'deleted')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (storage_bucket, storage_path),
  unique (id, owner_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete cascade
);

create table if not exists public.product_spins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid,
  title text not null check (char_length(title) between 1 and 160),
  spin_kind text not null check (spin_kind in ('product', 'vehicle')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  zoom double precision not null default 1 check (zoom between 0.5 and 3),
  rotation_interval_ms integer not null default 100 check (rotation_interval_ms between 30 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete cascade
);

create table if not exists public.product_spin_frames (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  spin_id uuid not null,
  media_asset_id uuid not null,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (spin_id, position),
  foreign key (spin_id, owner_id) references public.product_spins (id, owner_id) on delete cascade,
  foreign key (media_asset_id, owner_id) references public.media_assets (id, owner_id) on delete cascade
);

create table if not exists public.models_3d (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid,
  media_asset_id uuid,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  price numeric(12, 2) check (price is null or price >= 0),
  format text not null default 'glb' check (format in ('glb', 'gltf', 'ply_splat')),
  provider text check (provider is null or provider in ('tripo', 'polycam', 'nerfstudio', 'user_upload')),
  provider_task_id text,
  model_status text not null default 'draft' check (model_status in ('draft', 'processing', 'ready', 'failed', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete cascade,
  foreign key (media_asset_id, owner_id) references public.media_assets (id, owner_id) on delete set null (media_asset_id)
);

create table if not exists public.reconstruction_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid,
  job_kind text not null check (job_kind in ('environment_reconstruction', 'object_generation')),
  provider text not null check (provider in ('polycam', 'nerfstudio', 'tripo')),
  status text not null default 'queued' check (status in ('queued', 'uploading', 'submitted', 'running', 'succeeded', 'failed', 'cancelled', 'rejected', 'timed_out')),
  input_media_assets uuid[] not null default '{}',
  result_media_asset_id uuid,
  external_job_id text,
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  progress smallint check (progress is null or progress between 0 and 100),
  safe_error_code text,
  submitted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete cascade,
  foreign key (result_media_asset_id, owner_id) references public.media_assets (id, owner_id) on delete set null (result_media_asset_id)
);

create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  visibility text not null default 'unlisted' check (visibility in ('public', 'unlisted', 'private')),
  publication_status text not null default 'draft' check (publication_status in ('draft', 'published', 'disabled')),
  theme jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete cascade
);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  publication_id uuid not null references public.publications (id) on delete cascade,
  event_kind text not null check (event_kind in ('view', 'scene_change', 'hotspot_click')),
  scene_id uuid references public.scenes (id) on delete set null,
  occurred_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  plan_key text not null default 'free' check (plan_key in ('free', 'studio', 'teams')),
  subscription_status text not null default 'active' check (subscription_status in ('active', 'trialing', 'past_due', 'cancelled', 'paused')),
  provider text check (provider is null or provider in ('stripe', 'manual')),
  provider_customer_id text,
  provider_subscription_id text,
  period_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  usage_kind text not null check (usage_kind in ('published_project', 'storage_bytes', 'ai_job', 'team_member')),
  quantity bigint not null check (quantity > 0),
  usage_status text not null default 'reserved' check (usage_status in ('reserved', 'committed', 'released')),
  reference_id uuid,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists media_assets_owner_created_idx on public.media_assets (owner_id, created_at desc);
create index if not exists product_spins_owner_updated_idx on public.product_spins (owner_id, updated_at desc);
create index if not exists product_spin_frames_spin_position_idx on public.product_spin_frames (spin_id, position);
create index if not exists models_3d_owner_updated_idx on public.models_3d (owner_id, updated_at desc);
create index if not exists reconstruction_jobs_owner_created_idx on public.reconstruction_jobs (owner_id, created_at desc);
create index if not exists reconstruction_jobs_worker_idx on public.reconstruction_jobs (status, next_attempt_at) where status in ('queued', 'submitted', 'running');
create index if not exists publications_project_idx on public.publications (project_id);
create index if not exists analytics_publication_time_idx on public.analytics_events (publication_id, occurred_at desc);
create index if not exists usage_events_owner_kind_status_idx on public.usage_events (owner_id, usage_kind, usage_status, created_at desc);

alter table public.media_assets enable row level security;
alter table public.product_spins enable row level security;
alter table public.product_spin_frames enable row level security;
alter table public.models_3d enable row level security;
alter table public.reconstruction_jobs enable row level security;
alter table public.publications enable row level security;
alter table public.analytics_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_events enable row level security;

drop policy if exists "Owners manage their media metadata" on public.media_assets;
create policy "Owners manage their media metadata" on public.media_assets for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "Owners manage product spins" on public.product_spins;
create policy "Owners manage product spins" on public.product_spins for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "Owners manage product spin frames" on public.product_spin_frames;
create policy "Owners manage product spin frames" on public.product_spin_frames for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "Owners manage 3D models" on public.models_3d;
create policy "Owners manage 3D models" on public.models_3d for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "Owners read their processing jobs" on public.reconstruction_jobs;
create policy "Owners read their processing jobs" on public.reconstruction_jobs for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "Owners manage their publications" on public.publications;
create policy "Owners manage their publications" on public.publications for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "Owners read publication analytics" on public.analytics_events;
create policy "Owners read publication analytics" on public.analytics_events for select to authenticated using (
  exists (select 1 from public.publications p where p.id = publication_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "Owners read their subscription" on public.subscriptions;
create policy "Owners read their subscription" on public.subscriptions for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "Owners read their usage" on public.usage_events;
create policy "Owners read their usage" on public.usage_events for select to authenticated using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.media_assets, public.product_spins, public.product_spin_frames, public.models_3d, public.publications to authenticated;
grant select on public.reconstruction_jobs, public.analytics_events, public.subscriptions, public.usage_events to authenticated;
grant usage, select on sequence public.analytics_events_id_seq, public.usage_events_id_seq to service_role;
grant all on public.media_assets, public.product_spins, public.product_spin_frames, public.models_3d, public.reconstruction_jobs, public.publications, public.analytics_events, public.subscriptions, public.usage_events to service_role;
