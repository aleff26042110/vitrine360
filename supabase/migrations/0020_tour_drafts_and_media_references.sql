-- Separate owner editing state from the public scene snapshot.
alter table public.projects add column if not exists edit_revision uuid;
alter table public.projects add column if not exists draft_revision uuid;
alter table public.projects add column if not exists draft_digest text;
alter table public.projects add column if not exists draft_manifest jsonb;
update public.projects set edit_revision=content_revision where edit_revision is null;
alter table public.projects alter column edit_revision set default gen_random_uuid();
alter table public.projects alter column edit_revision set not null;

-- New public readers use whitelisted RPCs. Draft JSON/private paths must never
-- become public merely because the same project has a published version.
drop policy if exists "Published project metadata is public" on public.projects;
drop policy if exists "Published scene metadata is public" on public.scenes;
drop policy if exists "Published hotspot metadata is public" on public.hotspots;
revoke select on public.projects,public.scenes,public.hotspots from anon;

create or replace function public.tour_is_public(p_project_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.projects p join public.publications v on v.project_id=p.id and v.owner_id=p.owner_id
    where p.id=p_project_id and p.status='published' and v.publication_status='published' and v.visibility in ('public','unlisted'));
$$;
revoke all on function public.tour_is_public(uuid) from public;
grant execute on function public.tour_is_public(uuid) to anon,authenticated,service_role;

create or replace function public.media_path_is_referenced(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.scenes s where
      (p_bucket='vitrine360-private' and s.media_path=p_path) or (p_bucket='vitrine360-public' and s.public_media_path=p_path))
    or (p_bucket='vitrine360-private' and exists(select 1 from public.projects p,
      lateral pg_catalog.jsonb_array_elements(coalesce(p.draft_manifest->'scenes','[]'::jsonb)) s where s->>'media_path'=p_path))
    or (p_bucket='vitrine360-public' and exists(select 1 from public.showcase_publications v where v.publication_status='published' and p_path=any(v.asset_paths)))
    or exists(select 1 from public.media_assets a where a.storage_bucket=p_bucket and a.storage_path=p_path and
      (a.project_id is not null or exists(select 1 from public.product_spin_frames f where f.media_asset_id=a.id)
        or exists(select 1 from public.models_3d m where m.media_asset_id=a.id)))
    -- Conservative protection for manually linked images. Typed references are
    -- authoritative; an ambiguous same-path external URL is kept, never deleted.
    or exists(select 1 from public.hotspots h where
      h.image_url like '%/storage/v1/object/public/'||p_bucket||'/'||p_path||'%'
      or (p_path like 'r2:%' and h.image_url like '%/objects?%' and
        pg_catalog.strpos(pg_catalog.lower(h.image_url),'bucket='||p_bucket)>0 and
        pg_catalog.strpos(pg_catalog.lower(h.image_url),'path='||pg_catalog.lower(pg_catalog.replace(pg_catalog.substr(p_path,4),'/','%2F')))>0));
$$;
revoke all on function public.media_path_is_referenced(text,text) from public,anon,authenticated;
grant execute on function public.media_path_is_referenced(text,text) to service_role;

-- A publication retains a share lock until its transaction commits. Deletion
-- obtains the conflicting row lock before checking references and leasing R2.
create or replace function public.r2_asset_is_ready(p_bucket text,p_path text,p_bytes bigint default null,p_mime text default null)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v_object public.r2_gateway_objects%rowtype;
begin
  if auth.uid() is null then return false; end if;
  select * into v_object from public.r2_gateway_objects where bucket=p_bucket and path=p_path and owner_id=auth.uid() for share;
  return found and v_object.state='ready' and v_object.lease is null and (p_bytes is null or v_object.byte_size=p_bytes) and (p_mime is null or v_object.mime_type=p_mime);
end $$;
revoke all on function public.r2_asset_is_ready(text,text,bigint,text) from public,anon;
grant execute on function public.r2_asset_is_ready(text,text,bigint,text) to authenticated;

create or replace function public.guard_tour_draft_media()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_scene jsonb; v_path text;
begin
  if new.draft_manifest is null then return new; end if;
  if pg_catalog.jsonb_typeof(new.draft_manifest)<>'object' or pg_catalog.jsonb_typeof(new.draft_manifest->'scenes') is distinct from 'array'
    or pg_catalog.octet_length(new.draft_manifest::text)>1048576 then raise exception 'tour_invalid_manifest'; end if;
  for v_scene in select * from pg_catalog.jsonb_array_elements(new.draft_manifest->'scenes') loop
    v_path:=v_scene->>'media_path';
    if v_path is null or pg_catalog.split_part(pg_catalog.regexp_replace(v_path,'^r2:',''),'/',1)<>new.owner_id::text then raise exception 'tour_invalid_media_path'; end if;
    if v_path like 'r2:%' and not public.r2_asset_is_ready('vitrine360-private',pg_catalog.substr(v_path,4)) then raise exception 'tour_media_not_ready'; end if;
  end loop;
  return new;
end $$;
revoke all on function public.guard_tour_draft_media() from public;
drop trigger if exists projects_guard_draft_media on public.projects;
create trigger projects_guard_draft_media before insert or update of draft_manifest,owner_id on public.projects for each row execute function public.guard_tour_draft_media();

create or replace function public.load_owner_tour(p_project_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select pg_catalog.jsonb_build_object('id',p.id,'title',coalesce(p.draft_manifest->>'title',p.title),'status',p.status,'updated_at',p.updated_at,
    'initial_scene_id',coalesce(p.draft_manifest->>'initial_scene_id',p.initial_scene_id::text),'edit_revision',p.edit_revision,
    'scenes',coalesce(p.draft_manifest->'scenes',(select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by s.position) from public.scenes s where s.project_id=p.id),'[]'::jsonb),
    'hotspots',coalesce(p.draft_manifest->'hotspots',(select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(h)) from public.hotspots h join public.scenes s on s.id=h.scene_id where s.project_id=p.id),'[]'::jsonb))
  from public.projects p where p.id=p_project_id and p.owner_id=auth.uid() and auth.uid() is not null;
$$;
revoke all on function public.load_owner_tour(uuid) from public,anon;
grant execute on function public.load_owner_tour(uuid) to authenticated;

create or replace function public.commit_tour_revision(
  p_project_id uuid,p_revision uuid,p_expected_revision uuid,p_title text,p_publish boolean,
  p_initial_scene_id uuid,p_scenes jsonb,p_hotspots jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_owner uuid:=auth.uid(); v_project public.projects%rowtype;
  v_scene record; v_spot record; v_digest text; v_old_private text[]; v_old_public text[]; v_created integer; v_manifest jsonb;
begin
  if v_owner is null then raise exception 'auth_required'; end if;
  if p_project_id is null or p_revision is null or p_publish is null or p_title is null or pg_catalog.char_length(p_title) not between 1 and 160 then raise exception 'tour_invalid_manifest'; end if;
  if p_scenes is null or p_hotspots is null or pg_catalog.jsonb_typeof(p_scenes)<>'array' or pg_catalog.jsonb_typeof(p_hotspots)<>'array' then raise exception 'tour_invalid_manifest'; end if;
  -- Same technical metadata envelope as .v360 backups; not a business quota.
  if pg_catalog.octet_length(p_scenes::text)+pg_catalog.octet_length(p_hotspots::text)>1048576 or pg_catalog.jsonb_array_length(p_scenes)=0 then raise exception 'tour_invalid_manifest'; end if;
  v_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'project',p_project_id,'title',p_title,'publish',p_publish,'initial',p_initial_scene_id,'scenes',p_scenes,'hotspots',p_hotspots)::text,'UTF8')),'hex');
  -- Row lock serializes competing cutovers; creation does not overwrite another owner.
  insert into public.projects(id,owner_id,title) values(p_project_id,v_owner,p_title) on conflict(id) do nothing;
  get diagnostics v_created=row_count;
  select * into strict v_project from public.projects where id=p_project_id for update;
  if v_project.owner_id<>v_owner then raise exception 'tour_not_owned'; end if;
  if v_project.edit_revision=p_revision then
    if v_project.draft_digest is distinct from v_digest then raise exception 'tour_revision_reused'; end if;
    return pg_catalog.jsonb_build_object('revision',p_revision,'published',p_publish);
  end if;
  if (p_expected_revision is null and v_created=0)
    or (p_expected_revision is not null and p_expected_revision<>v_project.edit_revision) then raise exception 'tour_revision_conflict'; end if;
  -- A null baseline is only accepted for the row created by this operation.
  if p_expected_revision is null and (exists(select 1 from public.scenes where project_id=p_project_id)
    or exists(select 1 from public.publications where project_id=p_project_id)) then raise exception 'tour_revision_conflict'; end if;
  if (select count(distinct (s->>'id')::uuid) from pg_catalog.jsonb_array_elements(p_scenes) s)<>pg_catalog.jsonb_array_length(p_scenes)
    or exists(select 1 from pg_catalog.jsonb_array_elements(p_scenes) s where pg_catalog.jsonb_typeof(s)<>'object' or s->>'id' is null)
    or (select count(distinct (h->>'id')::uuid) from pg_catalog.jsonb_array_elements(p_hotspots) h)<>pg_catalog.jsonb_array_length(p_hotspots) then raise exception 'tour_invalid_manifest'; end if;
  if p_initial_scene_id is null or not exists(select 1 from pg_catalog.jsonb_array_elements(p_scenes) s where (s->>'id')::uuid=p_initial_scene_id) then raise exception 'tour_invalid_initial_scene'; end if;
  for v_scene in select * from pg_catalog.jsonb_to_recordset(p_scenes) as s(id uuid,title text,media_path text,public_media_path text,width integer,height integer,projection text,media_kind text,approximate boolean,north_offset double precision,byte_size bigint,mime_type text) loop
    if v_scene.id is null or v_scene.title is null or v_scene.width is null or v_scene.height is null or v_scene.width<=0 or v_scene.height<=0
      or v_scene.byte_size is null or v_scene.byte_size not between 1 and 524288000 or v_scene.mime_type is null
      or v_scene.media_kind is null or v_scene.media_kind not in ('image','video')
      or (v_scene.media_kind='image' and (v_scene.mime_type not in ('image/jpeg','image/png','image/webp','image/avif') or v_scene.byte_size>104857600))
      or (v_scene.media_kind='video' and v_scene.mime_type not in ('video/mp4','video/webm','video/quicktime')) then raise exception 'tour_invalid_scene_media'; end if;
    if exists(select 1 from public.scenes where id=v_scene.id and project_id<>p_project_id) then raise exception 'tour_scene_not_owned'; end if;
    if v_scene.media_path is null or v_scene.media_path !~ ('^(r2:)?'||v_owner::text||'/'||p_project_id::text||'/'||v_scene.id::text||'/'||p_revision::text||'/original$')
      or (p_publish and (v_scene.public_media_path is null or v_scene.public_media_path !~ ('^(r2:)?'||v_owner::text||'/'||p_project_id::text||'/'||v_scene.id::text||'/'||p_revision::text||'/published$')))
      or (not p_publish and v_scene.public_media_path is not null) then raise exception 'tour_invalid_media_path'; end if;
    if v_scene.media_path like 'r2:%' then
      if not public.r2_asset_is_ready('vitrine360-private',pg_catalog.substr(v_scene.media_path,4),v_scene.byte_size,v_scene.mime_type) then raise exception 'tour_media_not_ready'; end if;
    elsif not exists(select 1 from storage.objects where bucket_id='vitrine360-private' and name=v_scene.media_path) then raise exception 'tour_media_not_ready'; end if;
    if p_publish then
      if v_scene.public_media_path like 'r2:%' then
        if not public.r2_asset_is_ready('vitrine360-public',pg_catalog.substr(v_scene.public_media_path,4),v_scene.byte_size,v_scene.mime_type) then raise exception 'tour_media_not_ready'; end if;
      elsif not exists(select 1 from storage.objects where bucket_id='vitrine360-public' and name=v_scene.public_media_path) then raise exception 'tour_media_not_ready'; end if;
    end if;
  end loop;
  for v_spot in select * from pg_catalog.jsonb_to_recordset(p_hotspots) as h(id uuid,scene_id uuid,target_scene_id uuid) loop
    if v_spot.id is null or not exists(select 1 from pg_catalog.jsonb_array_elements(p_scenes) s where (s->>'id')::uuid=v_spot.scene_id)
      or (v_spot.target_scene_id is not null and not exists(select 1 from pg_catalog.jsonb_array_elements(p_scenes) s where (s->>'id')::uuid=v_spot.target_scene_id))
      or exists(select 1 from public.hotspots h join public.scenes s on s.id=h.scene_id where h.id=v_spot.id and s.project_id<>p_project_id) then raise exception 'tour_invalid_hotspot_target'; end if;
  end loop;
  v_manifest:=pg_catalog.jsonb_build_object('title',p_title,'initial_scene_id',p_initial_scene_id,'scenes',
    (select pg_catalog.jsonb_agg(s-'public_media_path') from pg_catalog.jsonb_array_elements(p_scenes) s),'hotspots',p_hotspots);
  select coalesce(array_agg(s->>'media_path'),array[]::text[]) into v_old_private
    from pg_catalog.jsonb_array_elements(coalesce(v_project.draft_manifest->'scenes','[]'::jsonb)) s;
  if not p_publish then
    update public.projects set title=case when status='published' then title else p_title end,edit_revision=p_revision,draft_revision=p_revision,draft_digest=v_digest,draft_manifest=v_manifest,updated_at=pg_catalog.now() where id=p_project_id;
    insert into public.media_cleanup_queue(bucket,path,owner_id,reason)
      select 'vitrine360-private',path,v_owner,'tour_revision' from pg_catalog.unnest(v_old_private) path where not public.media_path_is_referenced('vitrine360-private',path) on conflict do nothing;
    return pg_catalog.jsonb_build_object('revision',p_revision,'published',false);
  end if;
  select v_old_private||coalesce(array_agg(media_path),array[]::text[]),coalesce(array_agg(public_media_path) filter(where public_media_path is not null),array[]::text[])
    into v_old_private,v_old_public from public.scenes where project_id=p_project_id;
  set constraints public.scenes_project_id_position_key deferred;
  insert into public.scenes(id,project_id,position,title,media_path,public_media_path,width,height,projection,media_kind,approximate,north_offset)
    select (s->>'id')::uuid,p_project_id,position::integer-1,s->>'title',s->>'media_path',s->>'public_media_path',(s->>'width')::integer,(s->>'height')::integer,s->>'projection',s->>'media_kind',coalesce((s->>'approximate')::boolean,false),coalesce((s->>'north_offset')::double precision,0)
    from pg_catalog.jsonb_array_elements(p_scenes) with ordinality a(s,position)
    on conflict(id) do update set position=excluded.position,title=excluded.title,media_path=excluded.media_path,public_media_path=excluded.public_media_path,
      width=excluded.width,height=excluded.height,projection=excluded.projection,media_kind=excluded.media_kind,approximate=excluded.approximate,north_offset=excluded.north_offset;
  delete from public.hotspots h using public.scenes s where h.scene_id=s.id and s.project_id=p_project_id and not exists(select 1 from pg_catalog.jsonb_array_elements(p_hotspots) v where (v->>'id')::uuid=h.id);
  insert into public.hotspots(id,scene_id,target_scene_id,yaw,pitch,title,description,target_url,image_url,embed_url,spot_kind,icon_style,icon_scale)
    select id,scene_id,target_scene_id,yaw,pitch,title,coalesce(description,''),target_url,image_url,embed_url,spot_kind,icon_style,icon_scale
    from pg_catalog.jsonb_to_recordset(p_hotspots) as h(id uuid,scene_id uuid,target_scene_id uuid,yaw double precision,pitch double precision,title text,description text,target_url text,image_url text,embed_url text,spot_kind text,icon_style text,icon_scale double precision)
    on conflict(id) do update set scene_id=excluded.scene_id,target_scene_id=excluded.target_scene_id,yaw=excluded.yaw,pitch=excluded.pitch,title=excluded.title,description=excluded.description,
      target_url=excluded.target_url,image_url=excluded.image_url,embed_url=excluded.embed_url,spot_kind=excluded.spot_kind,icon_style=excluded.icon_style,icon_scale=excluded.icon_scale;
  delete from public.scenes s where project_id=p_project_id and not exists(select 1 from pg_catalog.jsonb_array_elements(p_scenes) v where (v->>'id')::uuid=s.id);
  update public.projects set title=p_title,status=case when p_publish then 'published' else 'draft' end,initial_scene_id=p_initial_scene_id,content_revision=p_revision,content_digest=v_digest,edit_revision=p_revision,draft_revision=p_revision,draft_digest=v_digest,draft_manifest=v_manifest,updated_at=pg_catalog.now() where id=p_project_id;
  insert into public.publications(owner_id,project_id,slug,visibility,publication_status,published_at,updated_at)
    values(v_owner,p_project_id,p_project_id::text,'unlisted',case when p_publish then 'published' else 'draft' end,case when p_publish then pg_catalog.now() else null end,pg_catalog.now())
    on conflict(slug) do update set publication_status=excluded.publication_status,published_at=excluded.published_at,updated_at=excluded.updated_at where public.publications.owner_id=v_owner and public.publications.project_id=p_project_id;
  insert into public.media_cleanup_queue(bucket,path,owner_id,reason)
    select 'vitrine360-private',path,v_owner,'tour_revision' from pg_catalog.unnest(v_old_private) path
      where pg_catalog.split_part(pg_catalog.regexp_replace(path,'^r2:',''),'/',1)=v_owner::text and not public.media_path_is_referenced('vitrine360-private',path) on conflict do nothing;
  insert into public.media_cleanup_queue(bucket,path,owner_id,reason)
    select 'vitrine360-public',path,v_owner,'tour_revision' from pg_catalog.unnest(v_old_public) path
      where pg_catalog.split_part(pg_catalog.regexp_replace(path,'^r2:',''),'/',1)=v_owner::text and not public.media_path_is_referenced('vitrine360-public',path) on conflict do nothing;
  return pg_catalog.jsonb_build_object('revision',p_revision,'published',p_publish);
end $$;
revoke all on function public.commit_tour_revision(uuid,uuid,uuid,text,boolean,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.commit_tour_revision(uuid,uuid,uuid,text,boolean,uuid,jsonb,jsonb) to authenticated;
