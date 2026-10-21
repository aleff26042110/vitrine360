-- A tour is a grouping resource. Removing it must preserve separately owned
-- objects, media metadata and provider jobs, including their cleanup references.
alter table public.media_assets drop constraint if exists media_assets_project_id_owner_id_fkey;
alter table public.media_assets add constraint media_assets_project_id_owner_id_fkey
  foreign key (project_id, owner_id) references public.projects (id, owner_id)
  on delete set null (project_id);

alter table public.product_spins drop constraint if exists product_spins_project_id_owner_id_fkey;
alter table public.product_spins add constraint product_spins_project_id_owner_id_fkey
  foreign key (project_id, owner_id) references public.projects (id, owner_id)
  on delete set null (project_id);

alter table public.models_3d drop constraint if exists models_3d_project_id_owner_id_fkey;
alter table public.models_3d add constraint models_3d_project_id_owner_id_fkey
  foreign key (project_id, owner_id) references public.projects (id, owner_id)
  on delete set null (project_id);

alter table public.reconstruction_jobs drop constraint if exists reconstruction_jobs_project_id_owner_id_fkey;
alter table public.reconstruction_jobs add constraint reconstruction_jobs_project_id_owner_id_fkey
  foreign key (project_id, owner_id) references public.projects (id, owner_id)
  on delete set null (project_id);
