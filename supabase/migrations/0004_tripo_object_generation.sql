-- Durable, idempotent Tripo job tracking and private GLB output storage.
alter table public.reconstruction_jobs add column if not exists idempotency_key uuid;
alter table public.reconstruction_jobs add column if not exists model_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reconstruction_jobs_model_owner_fkey' and conrelid = 'public.reconstruction_jobs'::regclass
  ) then
    alter table public.reconstruction_jobs
      add constraint reconstruction_jobs_model_owner_fkey
      foreign key (model_id, owner_id) references public.models_3d (id, owner_id) on delete set null (model_id);
  end if;
end;
$$;

create unique index if not exists reconstruction_jobs_owner_idempotency_idx
  on public.reconstruction_jobs (owner_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists reconstruction_jobs_provider_task_idx
  on public.reconstruction_jobs (provider, external_job_id) where external_job_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vitrine360-private', 'vitrine360-private', false, 104857600,
  array['image/jpeg','image/png','image/webp','image/avif','model/gltf-binary'])
on conflict (id) do update set
  public = false,
  file_size_limit = 104857600,
  allowed_mime_types = excluded.allowed_mime_types;
