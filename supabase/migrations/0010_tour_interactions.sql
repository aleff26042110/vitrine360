create or replace function public.load_tour_interactions(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_days integer := greatest(7, least(coalesce(p_days, 30), 365));
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  return (
    select jsonb_build_object(
      'scene_entries', count(*) filter (where event.event_kind = 'scene_change'),
      'hotspot_clicks', count(*) filter (where event.event_kind = 'hotspot_click')
    ) from public.analytics_events event
    join public.publications publication on publication.id = event.publication_id
    where publication.owner_id = v_owner
      and event.occurred_at >= current_date - (v_days - 1)
  );
end;
$$;
revoke all on function public.load_tour_interactions(integer) from public;
grant execute on function public.load_tour_interactions(integer) to authenticated;
