-- Server-owned R2 accounting. No client may reserve/release capacity, complete
-- uploads or reset operation counters. The Worker must verify its caller first.
create table if not exists public.r2_gateway_budget (
  singleton boolean primary key default true check (singleton),
  max_bytes bigint not null default 8000000000 check (max_bytes between 1 and 8000000000),
  max_reads bigint not null default 500000 check (max_reads between 1 and 500000),
  max_writes bigint not null default 10000 check (max_writes between 1 and 10000)
);
insert into public.r2_gateway_budget(singleton) values(true) on conflict do nothing;

create table if not exists public.r2_gateway_operations (
  period date primary key,
  reads bigint not null default 0 check (reads >= 0),
  writes bigint not null default 0 check (writes >= 0)
);

create table if not exists public.r2_gateway_objects (
  bucket text not null check (bucket in ('vitrine360-private','vitrine360-public')),
  path text not null,
  owner_id uuid not null,
  byte_size bigint not null check (byte_size between 1 and 524288000),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','video/quicktime','model/gltf-binary')),
  state text not null default 'uploading' check (state in ('uploading','ready','deleting','deleted')),
  upload_id text,
  lease uuid,
  operation text check (operation in ('create','part','complete','delete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(bucket,path),
  check ((lease is null) = (operation is null)),
  check (state <> 'ready' or upload_id is not null)
);
create index if not exists r2_gateway_objects_owner on public.r2_gateway_objects(owner_id);

alter table public.r2_gateway_budget enable row level security;
alter table public.r2_gateway_operations enable row level security;
alter table public.r2_gateway_objects enable row level security;
revoke all on public.r2_gateway_budget, public.r2_gateway_operations, public.r2_gateway_objects from public, anon, authenticated;

-- A lease deliberately has no automatic timeout: expiry does not establish
-- whether an interrupted R2 operation finished. Uncertain resources stay owned
-- and charged against the application's capacity until server reconciliation.
create or replace function public.r2_gateway(
  p_action text,
  p_owner uuid default null,
  p_bucket text default null,
  p_path text default null,
  p_bytes bigint default null,
  p_mime text default null,
  p_lease uuid default null,
  p_upload_id text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_budget public.r2_gateway_budget%rowtype;
  v_usage public.r2_gateway_operations%rowtype;
  v_object public.r2_gateway_objects%rowtype;
  v_period date := pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'UTC')::date;
  v_bytes bigint;
  v_public boolean := false;
  v_previous_state text;
begin
  if p_action is null or p_action not in ('status','inspect','reserve','attach','part','complete','delete','finish_part','finish_complete','finish_delete','read') then
    raise exception 'r2_invalid_action';
  end if;
  -- One shared row serializes capacity reservations and monthly counters.
  select * into strict v_budget from public.r2_gateway_budget where singleton for update;
  insert into public.r2_gateway_operations(period) values(v_period) on conflict do nothing;
  select * into strict v_usage from public.r2_gateway_operations where period=v_period;
  select coalesce(sum(byte_size),0) into v_bytes from public.r2_gateway_objects where state <> 'deleted';
  if p_action='status' then
    return pg_catalog.jsonb_build_object('reserved_bytes',v_bytes,'max_bytes',v_budget.max_bytes,
      'reads',v_usage.reads,'max_reads',v_budget.max_reads,'writes',v_usage.writes,'max_writes',v_budget.max_writes,'period',v_period);
  end if;
  if p_bucket is null or p_bucket not in ('vitrine360-private','vitrine360-public') or p_path is null
    or pg_catalog.char_length(p_path) > 300 or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(showcases/)?[0-9a-f-]{36}/[0-9a-f-]{36}/([0-9]{1,3}[.](glb|jpg|jpeg|png|webp|avif)|[0-9a-f-]{36}/(original|published))$' then
    raise exception 'r2_invalid_path';
  end if;
  if p_action <> 'read' and (p_owner is null or pg_catalog.split_part(p_path,'/',1) <> p_owner::text) then raise exception 'r2_not_owned'; end if;
  select * into v_object from public.r2_gateway_objects where bucket=p_bucket and path=p_path for update;
  if p_action='reserve' then
    if p_lease is null or p_bytes is null or p_bytes not between 1 and 524288000
      or p_mime is null or p_mime not in ('image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','video/quicktime','model/gltf-binary') then
      raise exception 'r2_invalid_media';
    end if;
    if v_object.path is not null then raise exception 'r2_path_already_reserved'; end if;
    if v_bytes + p_bytes > v_budget.max_bytes then raise exception 'r2_storage_limit'; end if;
    if v_usage.writes >= v_budget.max_writes then raise exception 'r2_write_limit'; end if;
    update public.r2_gateway_operations set writes=writes+1 where period=v_period;
    insert into public.r2_gateway_objects(bucket,path,owner_id,byte_size,mime_type,lease,operation)
      values(p_bucket,p_path,p_owner,p_bytes,p_mime,p_lease,'create') returning * into v_object;
    return pg_catalog.to_jsonb(v_object);
  end if;
  if v_object.path is null or v_object.state='deleted' then raise exception 'r2_object_not_found'; end if;
  if p_action='inspect' then
    if p_owner <> v_object.owner_id then raise exception 'r2_not_owned'; end if;
    return pg_catalog.to_jsonb(v_object);
  end if;
  if p_action='read' then
    if v_object.state <> 'ready' then raise exception 'r2_object_not_ready'; end if;
    if p_bucket='vitrine360-public' then
      select exists (
        select 1 from public.scenes s join public.projects p on p.id=s.project_id
        where p.status='published' and p.owner_id=v_object.owner_id and s.public_media_path='r2:'||p_path
      ) or exists (
        select 1 from public.showcase_publications s
        where s.publication_status='published' and s.owner_id=v_object.owner_id and ('r2:'||p_path)=any(s.asset_paths)
      ) into v_public;
    end if;
    if not v_public and (p_owner is null or p_owner <> v_object.owner_id) then raise exception 'r2_not_owned'; end if;
    if v_usage.reads >= v_budget.max_reads then raise exception 'r2_read_limit'; end if;
    update public.r2_gateway_operations set reads=reads+1 where period=v_period;
    return pg_catalog.to_jsonb(v_object);
  end if;
  if p_owner <> v_object.owner_id then raise exception 'r2_not_owned'; end if;
  if p_action in ('part','complete','delete') then
    if p_lease is null or v_object.lease is not null then raise exception 'r2_operation_in_progress'; end if;
    if p_action <> 'delete' and (v_object.state <> 'uploading' or v_object.upload_id is null) then raise exception 'r2_invalid_state'; end if;
    -- Unknown create outcome has no upload identity; do not free its reservation.
    if p_action='delete' and v_object.upload_id is null then raise exception 'r2_cleanup_requires_reconciliation'; end if;
    if p_action in ('part','complete') then
      if v_usage.writes >= v_budget.max_writes then raise exception 'r2_write_limit'; end if;
      update public.r2_gateway_operations set writes=writes+1 where period=v_period;
    end if;
    v_previous_state := v_object.state;
    update public.r2_gateway_objects set lease=p_lease,operation=p_action,
      state=case when p_action='delete' then 'deleting' else state end,updated_at=pg_catalog.now()
      where bucket=p_bucket and path=p_path returning * into v_object;
    return pg_catalog.to_jsonb(v_object) || pg_catalog.jsonb_build_object('previous_state',v_previous_state);
  end if;
  if p_lease is null or v_object.lease is distinct from p_lease then raise exception 'r2_lease_mismatch'; end if;
  if p_action='attach' then
    if v_object.operation <> 'create' or v_object.upload_id is not null or p_upload_id is null
      or pg_catalog.char_length(p_upload_id) not between 1 and 2048 then raise exception 'r2_invalid_state'; end if;
    update public.r2_gateway_objects set upload_id=p_upload_id,lease=null,operation=null,updated_at=pg_catalog.now()
      where bucket=p_bucket and path=p_path returning * into v_object;
  elsif p_action='finish_part' then
    if v_object.operation <> 'part' then raise exception 'r2_invalid_state'; end if;
    update public.r2_gateway_objects set lease=null,operation=null,updated_at=pg_catalog.now()
      where bucket=p_bucket and path=p_path returning * into v_object;
  elsif p_action='finish_complete' then
    if v_object.operation <> 'complete' or p_bytes is distinct from v_object.byte_size then raise exception 'r2_size_mismatch'; end if;
    update public.r2_gateway_objects set state='ready',lease=null,operation=null,updated_at=pg_catalog.now()
      where bucket=p_bucket and path=p_path returning * into v_object;
  elsif p_action='finish_delete' then
    if v_object.operation <> 'delete' then raise exception 'r2_invalid_state'; end if;
    update public.r2_gateway_objects set state='deleted',lease=null,operation=null,updated_at=pg_catalog.now()
      where bucket=p_bucket and path=p_path returning * into v_object;
  else raise exception 'r2_invalid_action';
  end if;
  return pg_catalog.to_jsonb(v_object);
end;
$$;
revoke all on function public.r2_gateway(text,uuid,text,text,bigint,text,uuid,text) from public,anon,authenticated;
grant execute on function public.r2_gateway(text,uuid,text,text,bigint,text,uuid,text) to service_role;
