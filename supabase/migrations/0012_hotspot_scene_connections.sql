alter table public.hotspots add column if not exists target_scene_id uuid references public.scenes(id) on delete set null;
create index if not exists hotspots_target_scene_idx on public.hotspots(target_scene_id) where target_scene_id is not null;

create or replace function public.validate_hotspot_scene_target()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.target_scene_id is not null and not exists (
    select 1 from public.scenes source_scene join public.scenes target_scene
      on target_scene.project_id = source_scene.project_id
    where source_scene.id = new.scene_id and target_scene.id = new.target_scene_id
  ) then
    raise exception 'A cena de destino deve pertencer ao mesmo tour.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists hotspots_validate_scene_target on public.hotspots;
create trigger hotspots_validate_scene_target before insert or update of scene_id, target_scene_id
  on public.hotspots for each row execute function public.validate_hotspot_scene_target();

create or replace function public.prevent_connected_scene_project_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.project_id is distinct from old.project_id and exists (
    select 1 from public.hotspots where target_scene_id is not null
      and (scene_id = old.id or target_scene_id = old.id)
  ) then
    raise exception 'Remova as conexões da cena antes de mudar seu tour.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists scenes_preserve_connections on public.scenes;
create trigger scenes_preserve_connections before update of project_id on public.scenes
  for each row execute function public.prevent_connected_scene_project_change();
