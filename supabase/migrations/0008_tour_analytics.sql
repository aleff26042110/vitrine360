alter table public.analytics_events add column if not exists event_key uuid;
alter table public.analytics_events add column if not exists hotspot_id uuid references public.hotspots (id) on delete set null;

update public.analytics_events set event_key = gen_random_uuid() where event_key is null;
alter table public.analytics_events alter column event_key set default gen_random_uuid();
alter table public.analytics_events alter column event_key set not null;
create unique index if not exists analytics_event_key_idx on public.analytics_events (event_key);

insert into public.publications (owner_id, project_id, slug, visibility, publication_status, published_at)
select p.owner_id, p.id, p.id::text, 'unlisted', 'published', coalesce(p.updated_at, now())
from public.projects p
where p.status = 'published'
on conflict (slug) do nothing;

create or replace function public.record_tour_event(
  p_project_id uuid,
  p_event_key uuid,
  p_event_kind text,
  p_scene_id uuid default null,
  p_hotspot_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publication_id uuid;
  v_inserted bigint;
begin
  if p_event_key is null or p_event_kind is null or p_event_kind not in ('view', 'scene_change', 'hotspot_click') then return false; end if;
  if p_event_kind in ('scene_change', 'hotspot_click') and p_scene_id is null then return false; end if;

  select publication.id into v_publication_id
  from public.publications publication
  join public.projects project on project.id = publication.project_id and project.owner_id = publication.owner_id
  where publication.project_id = p_project_id
    and publication.slug = p_project_id::text
    and publication.publication_status = 'published'
    and project.status = 'published';
  if v_publication_id is null then return false; end if;

  if p_scene_id is not null and not exists (
    select 1 from public.scenes scene where scene.id = p_scene_id and scene.project_id = p_project_id
  ) then return false; end if;
  if p_event_kind = 'hotspot_click' and p_hotspot_id is null then return false; end if;
  if p_hotspot_id is not null and not exists (
    select 1 from public.hotspots hotspot where hotspot.id = p_hotspot_id and hotspot.scene_id = p_scene_id
  ) then return false; end if;

  insert into public.analytics_events (publication_id, event_key, event_kind, scene_id, hotspot_id)
  values (v_publication_id, p_event_key, p_event_kind, p_scene_id, p_hotspot_id)
  on conflict (event_key) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

create or replace function public.load_tour_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_days integer := greatest(7, least(coalesce(p_days, 30), 365));
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  return jsonb_build_object(
    'total_views', (
      select count(*) from public.analytics_events event
      join public.publications publication on publication.id = event.publication_id
      where publication.owner_id = v_owner and event.event_kind = 'view'
    ),
    'period_views', (
      select count(*) from public.analytics_events event
      join public.publications publication on publication.id = event.publication_id
      where publication.owner_id = v_owner and event.event_kind = 'view'
        and event.occurred_at >= current_date - (v_days - 1)
    ),
    'views_this_month', (
      select count(*) from public.analytics_events event
      join public.publications publication on publication.id = event.publication_id
      where publication.owner_id = v_owner and event.event_kind = 'view'
        and event.occurred_at >= date_trunc('month', current_date)
    ),
    'published_tours', (
      select count(*) from public.publications publication
      where publication.owner_id = v_owner and publication.publication_status = 'published'
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('date', day.value::date, 'views', coalesce(events.views, 0)) order by day.value), '[]'::jsonb)
      from generate_series(current_date - (v_days - 1), current_date, interval '1 day') day(value)
      left join (
        select event.occurred_at::date as date, count(*) as views
        from public.analytics_events event
        join public.publications publication on publication.id = event.publication_id
        where publication.owner_id = v_owner and event.event_kind = 'view'
          and event.occurred_at >= current_date - (v_days - 1)
        group by event.occurred_at::date
      ) events on events.date = day.value::date
    ),
    'top_tours', (
      select coalesce(jsonb_agg(row_to_json(top_row) order by top_row.views desc), '[]'::jsonb)
      from (
        select project.id as project_id, project.title, count(event.id) as views
        from public.publications publication
        join public.projects project on project.id = publication.project_id
        left join public.analytics_events event on event.publication_id = publication.id
          and event.event_kind = 'view' and event.occurred_at >= current_date - (v_days - 1)
        where publication.owner_id = v_owner and publication.publication_status = 'published'
        group by project.id, project.title
        order by views desc, project.title
        limit 10
      ) top_row
    )
  );
end;
$$;

revoke all on function public.record_tour_event(uuid, uuid, text, uuid, uuid) from public;
revoke all on function public.load_tour_analytics(integer) from public;
grant execute on function public.record_tour_event(uuid, uuid, text, uuid, uuid) to anon, authenticated;
grant execute on function public.load_tour_analytics(integer) to authenticated;
