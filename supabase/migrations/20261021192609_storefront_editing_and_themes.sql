-- Align the editor and server catalogue; optional presentation fields preserve existing snapshots.
-- One private draft and one explicit public snapshot per authenticated creator.
create or replace function public.valid_storefront_document(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when pg_catalog.jsonb_typeof(p) <> 'object'
    or pg_catalog.jsonb_typeof(p->'itemIds') is distinct from 'array'
    then false else coalesce(
      p->>'version' = '1'
      and pg_catalog.pg_column_size(p) <= 25000
      and (p - array['version','name','slug','headline','description','contactUrl','template','background','accent','font','itemIds','showPrices','showDescriptions','imageFit','density']) = '{}'::jsonb
      and not exists (select 1 from pg_catalog.unnest(array['name','slug','headline','description','contactUrl','template','background','accent','font']) k where pg_catalog.jsonb_typeof(p->k) is distinct from 'string')
      and pg_catalog.char_length(pg_catalog.btrim(p->>'name')) between 1 and 100
      and (p->>'slug' = '' or p->>'slug' ~ '^[a-z0-9][a-z0-9-]{2,59}$')
      and pg_catalog.char_length(p->>'headline') <= 140
      and pg_catalog.char_length(p->>'description') <= 1000
      and pg_catalog.char_length(p->>'contactUrl') <= 2048
      and (p->>'contactUrl' = '' or p->>'contactUrl' ~ '^https?://')
      and p->>'template' in ('editorial','gallery','showroom','jewelry_luxury','auto_premium','botanical_garden','nordic_studio','art_deco','brutalist_concrete')
      and (not p ? 'showPrices' or pg_catalog.jsonb_typeof(p->'showPrices') = 'boolean')
      and (not p ? 'showDescriptions' or pg_catalog.jsonb_typeof(p->'showDescriptions') = 'boolean')
      and (not p ? 'imageFit' or p->>'imageFit' in ('contain','cover'))
      and (not p ? 'density' or p->>'density' in ('comfortable','compact'))
      and p->>'font' in ('editorial','modern')
      and p->>'background' ~ '^#[0-9A-Fa-f]{6}$'
      and p->>'accent' ~ '^#[0-9A-Fa-f]{6}$'
      and pg_catalog.jsonb_array_length(p->'itemIds') <= 100
      and not exists (select 1 from pg_catalog.jsonb_array_elements(p->'itemIds') item where pg_catalog.jsonb_typeof(item) <> 'string' or (item #>> '{}') !~ '^(local:)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-f]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    , false) end;
$$;
revoke all on function public.valid_storefront_document(jsonb) from public;
grant execute on function public.valid_storefront_document(jsonb) to authenticated, service_role;
