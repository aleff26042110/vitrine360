-- Server-managed membership. Never derive authority from email, browser state
-- or user-editable auth metadata. Normal project RLS remains unchanged.
create table if not exists public.site_administrators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.site_administrators enable row level security;
revoke all on public.site_administrators from public, anon, authenticated;
grant select, insert, delete on public.site_administrators to service_role;

create or replace function public.is_site_administrator()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.site_administrators a where a.user_id = auth.uid()
  );
$$;
revoke all on function public.is_site_administrator() from public, anon;
grant execute on function public.is_site_administrator() to authenticated;

-- A deliberately read-only control panel: aggregate usage and recent projects.
-- No private file paths, user emails, credentials or destructive actions.
create or replace function public.site_admin_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_site_administrator() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'users', (select count(*) from public.profiles),
    'tours', (select count(*) from public.projects),
    'spins', (select count(*) from public.product_spins),
    'models', (select count(*) from public.models_3d),
    'publications', (select count(*) from public.showcase_publications where publication_status='published')
      + (select count(*) from public.projects where status='published'),
    'storage', (select pg_catalog.jsonb_build_object(
      'reserved_bytes', coalesce((select sum(byte_size) from public.r2_gateway_objects where state <> 'deleted'),0),
      'max_bytes', b.max_bytes, 'reads', coalesce(o.reads,0), 'writes', coalesce(o.writes,0),
      'max_reads',b.max_reads,'max_writes',b.max_writes
    ) from public.r2_gateway_budget b left join public.r2_gateway_operations o
      on o.period = pg_catalog.date_trunc('month',pg_catalog.now() at time zone 'UTC')::date),
    'recent_projects', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p)) from (
      select id,title,status,updated_at from public.projects order by updated_at desc,id limit 20
    ) p),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.site_admin_overview() from public, anon;
grant execute on function public.site_admin_overview() to authenticated;
