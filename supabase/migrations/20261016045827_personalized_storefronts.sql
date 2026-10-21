-- One private draft and one explicit public snapshot per authenticated creator.
create or replace function public.valid_storefront_document(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when pg_catalog.jsonb_typeof(p) <> 'object'
    or pg_catalog.jsonb_typeof(p->'itemIds') is distinct from 'array'
    then false else coalesce(
      p->>'version' = '1'
      and pg_catalog.pg_column_size(p) <= 25000
      and (p - array['version','name','slug','headline','description','contactUrl','template','background','accent','font','itemIds']) = '{}'::jsonb
      and not exists (select 1 from pg_catalog.unnest(array['name','slug','headline','description','contactUrl','template','background','accent','font']) k where pg_catalog.jsonb_typeof(p->k) is distinct from 'string')
      and pg_catalog.char_length(pg_catalog.btrim(p->>'name')) between 1 and 100
      and (p->>'slug' = '' or p->>'slug' ~ '^[a-z0-9][a-z0-9-]{2,59}$')
      and pg_catalog.char_length(p->>'headline') <= 140
      and pg_catalog.char_length(p->>'description') <= 600
      and pg_catalog.char_length(p->>'contactUrl') <= 2048
      and (p->>'contactUrl' = '' or p->>'contactUrl' ~ '^https?://')
      and p->>'template' in ('editorial','gallery','showroom')
      and p->>'font' in ('editorial','modern')
      and p->>'background' ~ '^#[0-9A-Fa-f]{6}$'
      and p->>'accent' ~ '^#[0-9A-Fa-f]{6}$'
      and pg_catalog.jsonb_array_length(p->'itemIds') <= 60
      and not exists (select 1 from pg_catalog.jsonb_array_elements(p->'itemIds') item where pg_catalog.jsonb_typeof(item) <> 'string' or (item #>> '{}') !~ '^(local:)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-f]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    , false) end;
$$;
revoke all on function public.valid_storefront_document(jsonb) from public;
grant execute on function public.valid_storefront_document(jsonb) to authenticated, service_role;

create table if not exists public.storefronts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  slug text unique check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  draft jsonb not null check (public.valid_storefront_document(draft)),
  published jsonb check (published is null or (slug is not null and public.valid_storefront_document(published) and published->>'slug' = slug)),
  updated_at timestamptz not null default now()
);
alter table public.storefronts enable row level security;
revoke all on public.storefronts from anon, authenticated;
grant select, insert, update, delete on public.storefronts to authenticated;
grant all on public.storefronts to service_role;
drop policy if exists "Creators own their storefront" on public.storefronts;
create policy "Creators own their storefront" on public.storefronts for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create or replace function public.save_storefront_draft(p_document jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'authentication_required'; end if;
  if not public.valid_storefront_document(p_document) then raise exception 'invalid_storefront_document'; end if;
  insert into public.storefronts(owner_id,draft) values(v_owner,p_document)
    on conflict(owner_id) do update set draft = excluded.draft, updated_at = pg_catalog.now();
end;
$$;
revoke all on function public.save_storefront_draft(jsonb) from public;
grant execute on function public.save_storefront_draft(jsonb) to authenticated;

create or replace function public.publish_storefront(p_document jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_slug text := coalesce(nullif(btrim(p_document->>'slug'), ''), 'minha-vitrine');
begin
  if v_owner is null then raise exception 'authentication_required'; end if;
  if v_slug = 'minha-vitrine' and p_document->>'name' is not null and btrim(p_document->>'name') <> '' then
    v_slug := regexp_replace(lower(translate(p_document->>'name', 'ÁÀÂÃÄÅáàâãäåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÕÖØóòôõöøÚÙÛÜúùûüÝýÿ', 'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNNnnOOOOOOooooooUUUUuuuuYyy')), '[^a-z0-9]+', '-', 'g');
    v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
    if v_slug !~ '^[a-z0-9][a-z0-9-]{2,59}$' then v_slug := 'minha-vitrine'; end if;
  elsif v_slug !~ '^[a-z0-9][a-z0-9-]{2,59}$' then
    v_slug := 'minha-vitrine';
  end if;
  p_document := jsonb_set(p_document, '{slug}', to_jsonb(v_slug), true);
  if not public.valid_storefront_document(p_document)
    or pg_catalog.jsonb_array_length(p_document->'itemIds') = 0 then raise exception 'invalid_storefront_document'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements_text(p_document->'itemIds') selected(id)
    where not exists (select 1 from public.showcase_publications publication
      where publication.id::text = selected.id and publication.owner_id = v_owner and publication.publication_status = 'published')
  ) then raise exception 'storefront_items_must_be_owned_and_published'; end if;
  insert into public.storefronts(owner_id,slug,draft,published) values(v_owner,v_slug,p_document,p_document)
    on conflict(owner_id) do update set slug = excluded.slug, draft = excluded.draft, published = excluded.published, updated_at = pg_catalog.now();
  return v_slug;
end;
$$;
revoke all on function public.publish_storefront(jsonb) from public;
grant execute on function public.publish_storefront(jsonb) to authenticated;

-- Intentionally public, bounded reader: never returns private drafts or foreign items.
-- SECURITY DEFINER is required because the underlying tables remain owner-private.
create or replace function public.load_public_storefront(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('document', storefront.published - 'itemIds', 'items', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', publication.id, 'title', publication.title, 'description', publication.description,
      'price_label', publication.price_label, 'kind', publication.kind, 'slug', publication.slug,
      'asset_paths', publication.asset_paths, 'spin_kind', spin.spin_kind
    ) order by selected.position)
    from pg_catalog.jsonb_array_elements_text(storefront.published->'itemIds') with ordinality selected(id,position)
    join public.showcase_publications publication on publication.id::text = selected.id
      and publication.owner_id = storefront.owner_id and publication.publication_status = 'published'
    left join public.product_spins spin on spin.id = publication.spin_id and spin.owner_id = storefront.owner_id
  ), '[]'::jsonb)) from public.storefronts storefront
  where p_slug ~ '^[a-z0-9][a-z0-9-]{2,59}$' and storefront.slug = p_slug and storefront.published is not null limit 1;
$$;
revoke all on function public.load_public_storefront(text) from public;
grant execute on function public.load_public_storefront(text) to anon, authenticated;
