-- Retire metadata before any asynchronous physical deletion. The outbox keeps
-- reserved bytes charged until a reconciler confirms removal through the gateway.
-- SECURITY DEFINER is needed only to write the private cleanup outbox; all entry
-- points check the authenticated owner and lock the same project as publication.
create or replace function public.retire_tour(p_project_id uuid,p_delete boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_owner uuid:=auth.uid();
  v_project public.projects%rowtype;
  v_private text[];
  v_public text[];
  v_pending boolean;
begin
  if v_owner is null then raise exception 'auth_required'; end if;
  if p_project_id is null or p_delete is null then raise exception 'tour_invalid_retirement'; end if;
  select * into v_project from public.projects where id=p_project_id for update;
  if not found or v_project.owner_id<>v_owner then raise exception 'tour_not_owned'; end if;

  select coalesce(pg_catalog.array_agg(s.media_path),array[]::text[]),
    coalesce(pg_catalog.array_agg(s.public_media_path) filter(where s.public_media_path is not null),array[]::text[])
    into v_private,v_public from public.scenes s where s.project_id=p_project_id;
  -- A newer owner draft may refer to files absent from the published scenes.
  select v_private || coalesce(pg_catalog.array_agg(s->>'media_path') filter(where s->>'media_path' is not null),array[]::text[])
    into v_private from pg_catalog.jsonb_array_elements(coalesce(v_project.draft_manifest->'scenes','[]'::jsonb)) s;

  if p_delete then
    -- 0009 FKs detach separately owned assets/spins/models/jobs instead of deleting
    -- them. Tour scenes, hotspots and publications cascade with the grouping row.
    delete from public.projects where id=p_project_id;
  else
    -- Invalidate in-flight edits that used the old baseline before unpublishing.
    update public.projects set status='draft',edit_revision=pg_catalog.gen_random_uuid(),updated_at=pg_catalog.now() where id=p_project_id;
    update public.publications set publication_status='disabled',updated_at=pg_catalog.now() where project_id=p_project_id and owner_id=v_owner;
    update public.scenes set public_media_path=null where project_id=p_project_id and public_media_path is not null;
  end if;

  -- Never queue a path used by another tour, a preserved object, or an external
  -- hotspot reference. A reconciler must recheck references before deletion too.
  insert into public.media_cleanup_queue(bucket,path,owner_id,reason)
    select 'vitrine360-public',path,v_owner,'tour_revision' from pg_catalog.unnest(v_public) path
    where pg_catalog.split_part(pg_catalog.regexp_replace(path,'^r2:',''),'/',1)=v_owner::text
      and not public.media_path_is_referenced('vitrine360-public',path)
      and not exists(select 1 from public.media_assets a where a.storage_bucket='vitrine360-public' and a.storage_path=path)
    on conflict do nothing;
  if p_delete then
    insert into public.media_cleanup_queue(bucket,path,owner_id,reason)
      select 'vitrine360-private',path,v_owner,'tour_revision' from pg_catalog.unnest(v_private) path
      where pg_catalog.split_part(pg_catalog.regexp_replace(path,'^r2:',''),'/',1)=v_owner::text
        and not public.media_path_is_referenced('vitrine360-private',path)
        and not exists(select 1 from public.media_assets a where a.storage_bucket='vitrine360-private' and a.storage_path=path)
      on conflict do nothing;
  end if;
  select exists(select 1 from public.media_cleanup_queue q where q.owner_id=v_owner and
    ((q.bucket='vitrine360-public' and q.path=any(v_public)) or (p_delete and q.bucket='vitrine360-private' and q.path=any(v_private)))) into v_pending;
  return pg_catalog.jsonb_build_object('id',p_project_id,'deleted',p_delete,'cleanup_pending',v_pending);
end $$;
revoke all on function public.retire_tour(uuid,boolean) from public,anon;
grant execute on function public.retire_tour(uuid,boolean) to authenticated;
