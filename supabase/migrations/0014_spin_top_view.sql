-- Two independently captured perspectives; old single-view RPC remains available.
alter table public.showcase_publications add column if not exists top_frame_count integer not null default 0;
alter table public.showcase_publications drop constraint if exists showcase_publications_check;
alter table public.showcase_publications drop constraint if exists showcase_view_manifest_check;
alter table public.showcase_publications add constraint showcase_view_manifest_check check (
  (kind = 'model_3d' and model_id is not null and spin_id is null and cardinality(asset_paths) = 1 and top_frame_count = 0)
  or (kind = 'product_spin' and spin_id is not null and model_id is null
    and cardinality(asset_paths) - top_frame_count between 2 and 120
    and (top_frame_count = 0 or top_frame_count between 2 and 120))
);

create or replace function public.publish_showcase_views(
  p_kind text,
  p_item_id uuid,
  p_slug text,
  p_title text,
  p_description text,
  p_price_label text,
  p_background text,
  p_asset_ids uuid[],
  p_asset_paths text[],
  p_original_names text[],
  p_mime_types text[],
  p_byte_sizes bigint[],
  p_spin_kind text default null,
  p_zoom double precision default 1,
  p_rotation_interval_ms integer default 100,
  p_top_frame_count integer default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_publication_id uuid;
  v_old_paths text[] := array[]::text[];
  v_rows integer;
  v_asset_kind text;
  v_index integer;
  v_total_bytes bigint := 0;
begin
  if v_owner is null then raise exception 'auth_required'; end if;
  if p_kind is null or p_item_id is null or p_kind not in ('model_3d', 'product_spin') then raise exception 'invalid_kind'; end if;
  if p_title is null or pg_catalog.char_length(p_title) not between 1 and 160 then raise exception 'invalid_title'; end if;
  if p_description is null or pg_catalog.char_length(p_description) > 4000 then raise exception 'invalid_description'; end if;
  if p_price_label is not null and pg_catalog.char_length(p_price_label) > 100 then raise exception 'invalid_price_label'; end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{2,79}$' then raise exception 'invalid_slug'; end if;
  if p_background !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid_background'; end if;
  if p_asset_ids is null or p_asset_paths is null or p_original_names is null or p_mime_types is null or p_byte_sizes is null
    or pg_catalog.cardinality(p_asset_ids) <> pg_catalog.cardinality(p_asset_paths)
    or pg_catalog.cardinality(p_asset_ids) <> pg_catalog.cardinality(p_original_names)
    or pg_catalog.cardinality(p_asset_ids) <> pg_catalog.cardinality(p_mime_types)
    or pg_catalog.cardinality(p_asset_ids) <> pg_catalog.cardinality(p_byte_sizes) then
    raise exception 'invalid_asset_manifest';
  end if;
  if p_top_frame_count is null or p_top_frame_count < 0
    or (p_kind = 'model_3d' and p_top_frame_count <> 0)
    or (p_top_frame_count <> 0 and p_top_frame_count not between 2 and 120)
    or (p_kind = 'model_3d' and pg_catalog.cardinality(p_asset_ids) <> 1)
    or (p_kind = 'product_spin' and pg_catalog.cardinality(p_asset_ids) - p_top_frame_count not between 2 and 120) then
    raise exception 'invalid_asset_count';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(p_asset_paths) p(path)
    where p.path !~ ('^' || v_owner::text || '/showcases/' || p_item_id::text || '/[0-9a-f-]{36}/[0-9]{1,3}[.](glb|jpg|jpeg|png|webp|avif)$')
  ) then raise exception 'invalid_asset_path'; end if;

  v_asset_kind := case when p_kind = 'model_3d' then 'model_glb' else 'spin_frame' end;
  for v_index in 1..pg_catalog.cardinality(p_asset_ids) loop
    if (p_kind = 'model_3d' and (p_mime_types[v_index] <> 'model/gltf-binary' or p_byte_sizes[v_index] <= 0 or p_byte_sizes[v_index] > 157286400))
      or (p_kind = 'product_spin' and (p_mime_types[v_index] not in ('image/jpeg','image/png','image/webp','image/avif') or p_byte_sizes[v_index] <= 0 or p_byte_sizes[v_index] > 104857600)) then
      raise exception 'invalid_asset_type_or_size';
    end if;
    v_total_bytes := v_total_bytes + p_byte_sizes[v_index];
  end loop;
  if p_kind = 'product_spin' and v_total_bytes > 524288000 then raise exception 'spin_exceeds_total_size_limit'; end if;

  if p_kind = 'model_3d' then
    insert into public.models_3d (id, owner_id, title, description, format, model_status, updated_at)
      values (p_item_id, v_owner, p_title, p_description, 'glb', 'published', pg_catalog.now())
      on conflict (id) do update set title = excluded.title, description = excluded.description,
        model_status = 'published', updated_at = excluded.updated_at
        where public.models_3d.owner_id = v_owner;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'item_not_owned'; end if;
    select s.id, s.asset_paths into v_publication_id, v_old_paths
      from public.showcase_publications s where s.owner_id = v_owner and s.model_id = p_item_id for update;
  else
    if p_spin_kind not in ('product', 'vehicle') then raise exception 'invalid_spin_kind'; end if;
    if p_zoom is null or p_zoom not between 0.5 and 3 then raise exception 'invalid_spin_zoom'; end if;
    if p_rotation_interval_ms is null or p_rotation_interval_ms not between 30 and 2000 then raise exception 'invalid_spin_interval'; end if;
    insert into public.product_spins (id, owner_id, title, spin_kind, status, zoom, rotation_interval_ms, updated_at)
      values (p_item_id, v_owner, p_title, p_spin_kind, 'published', p_zoom, p_rotation_interval_ms, pg_catalog.now())
      on conflict (id) do update set title = excluded.title, spin_kind = excluded.spin_kind,
        status = 'published', zoom = excluded.zoom, rotation_interval_ms = excluded.rotation_interval_ms,
        updated_at = excluded.updated_at
        where public.product_spins.owner_id = v_owner;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'item_not_owned'; end if;
    select s.id, s.asset_paths into v_publication_id, v_old_paths
      from public.showcase_publications s where s.owner_id = v_owner and s.spin_id = p_item_id for update;
  end if;

  insert into public.media_assets (id, owner_id, storage_bucket, storage_path, asset_kind, original_name, mime_type, byte_size)
  select p_asset_ids[g.i], v_owner, 'vitrine360-public', p_asset_paths[g.i], v_asset_kind,
    p_original_names[g.i], p_mime_types[g.i], p_byte_sizes[g.i]
  from pg_catalog.generate_subscripts(p_asset_ids, 1) g(i);

  if p_kind = 'product_spin' then
    delete from public.product_spin_frames where spin_id = p_item_id and owner_id = v_owner;
    insert into public.product_spin_frames (owner_id, spin_id, media_asset_id, position)
    select v_owner, p_item_id, a.id, a.position - 1
    from pg_catalog.unnest(p_asset_ids) with ordinality a(id, position);
  end if;

  if v_publication_id is null then
    insert into public.showcase_publications (
      owner_id, kind, model_id, spin_id, slug, title, description, price_label,
      background, asset_paths, top_frame_count, publication_status, published_at, updated_at
    ) values (
      v_owner, p_kind, case when p_kind = 'model_3d' then p_item_id end,
      case when p_kind = 'product_spin' then p_item_id end, p_slug, p_title,
      p_description, p_price_label, p_background, p_asset_paths, p_top_frame_count, 'published', pg_catalog.now(), pg_catalog.now()
    ) returning id into v_publication_id;
  else
    update public.showcase_publications set slug = p_slug, title = p_title,
      description = p_description, price_label = p_price_label, background = p_background,
      asset_paths = p_asset_paths, top_frame_count = p_top_frame_count, publication_status = 'published',
      published_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = v_publication_id and owner_id = v_owner;
  end if;
  return pg_catalog.jsonb_build_object('id', v_publication_id, 'slug', p_slug, 'old_asset_paths', pg_catalog.to_jsonb(v_old_paths));
end;
$$;

revoke all on function public.publish_showcase_views(text, uuid, text, text, text, text, text, uuid[], text[], text[], text[], bigint[], text, double precision, integer, integer) from public;
grant execute on function public.publish_showcase_views(text, uuid, text, text, text, text, text, uuid[], text[], text[], text[], bigint[], text, double precision, integer, integer) to authenticated;

-- Preserve the single-view contract and explicitly clear any previous top partition.
-- All validation and publishing are owned by the new routine.
create or replace function public.publish_showcase(
  p_kind text, p_item_id uuid, p_slug text, p_title text, p_description text,
  p_price_label text, p_background text, p_asset_ids uuid[], p_asset_paths text[],
  p_original_names text[], p_mime_types text[], p_byte_sizes bigint[],
  p_spin_kind text default null, p_zoom double precision default 1,
  p_rotation_interval_ms integer default 100
)
returns jsonb language sql security invoker set search_path = ''
as $$
  select public.publish_showcase_views(
    p_kind, p_item_id, p_slug, p_title, p_description, p_price_label, p_background,
    p_asset_ids, p_asset_paths, p_original_names, p_mime_types, p_byte_sizes,
    p_spin_kind, p_zoom, p_rotation_interval_ms, 0
  );
$$;
revoke all on function public.publish_showcase(text, uuid, text, text, text, text, text, uuid[], text[], text[], text[], bigint[], text, double precision, integer) from public;
grant execute on function public.publish_showcase(text, uuid, text, text, text, text, text, uuid[], text[], text[], text[], bigint[], text, double precision, integer) to authenticated;

create or replace function public.load_public_showcase(p_slug text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'kind', s.kind, 'slug', s.slug, 'title', s.title,
    'description', s.description, 'price_label', s.price_label, 'background', s.background,
    'zoom', case when s.kind = 'product_spin' then
      (select ps.zoom from public.product_spins ps where ps.id = s.spin_id and ps.owner_id = s.owner_id)
      else 1 end,
    'assets', pg_catalog.to_jsonb(s.asset_paths[1:pg_catalog.cardinality(s.asset_paths) - s.top_frame_count])
  ) || case when s.top_frame_count > 0 then pg_catalog.jsonb_build_object(
    'top_assets', pg_catalog.to_jsonb(s.asset_paths[pg_catalog.cardinality(s.asset_paths) - s.top_frame_count + 1:pg_catalog.cardinality(s.asset_paths)])
  ) else '{}'::jsonb end
  from public.showcase_publications s
  where s.slug = p_slug and s.publication_status = 'published'
  limit 1;
$$;
revoke all on function public.load_public_showcase(text) from public;
grant execute on function public.load_public_showcase(text) to anon, authenticated;
