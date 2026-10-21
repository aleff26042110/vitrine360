create schema if not exists billing_private;
revoke all on schema billing_private from public, anon, authenticated;

create function billing_private.limits(p_owner uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('plan',coalesce(a.plan_key,'free'),'items',case a.plan_key when 'essential' then 10 when 'professional' then 40 when 'business' then 100 else 3 end,
    'bytes',case a.plan_key when 'essential' then 1000000000::bigint when 'professional' then 3000000000::bigint when 'business' then 10000000000::bigint else 250000000::bigint end)
  from (select 1) seed left join public.billing_pix_access a on a.owner_id = p_owner and a.valid_until > now();
$$;
revoke all on function billing_private.limits(uuid) from public, anon, authenticated;

create function billing_private.storage_bytes(p_owner uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(byte_size) from public.r2_gateway_objects where owner_id=p_owner and state <> 'deleted'),0)
   + coalesce((select sum(case when metadata->>'size' ~ '^\d+$' then (metadata->>'size')::bigint else 0 end) from storage.objects
     where bucket_id in ('vitrine360-private','vitrine360-public') and split_part(name,'/',1)=p_owner::text),0);
$$;
revoke all on function billing_private.storage_bytes(uuid) from public, anon, authenticated;

create function billing_private.enforce_storage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_growth bigint; v_limit bigint; v_total bigint;
begin
  if tg_table_schema = 'storage' then
    if new.bucket_id not in ('vitrine360-private','vitrine360-public') then return new; end if;
    if split_part(new.name,'/',1) !~ '^[0-9a-fA-F-]{36}$' then return new; end if;
    v_owner := split_part(new.name,'/',1)::uuid;
    if tg_op = 'UPDATE' and (old.name <> new.name or old.bucket_id <> new.bucket_id) then raise exception 'billing_storage_move_not_supported'; end if;
    v_growth := case when new.metadata->>'size' ~ '^\d+$' then (new.metadata->>'size')::bigint else 0 end;
    if tg_op = 'UPDATE' then v_growth := v_growth - case when old.metadata->>'size' ~ '^\d+$' then (old.metadata->>'size')::bigint else 0 end; end if;
  else
    v_owner := new.owner_id;
    v_growth := case when new.state <> 'deleted' then new.byte_size else 0 end;
    if tg_op = 'UPDATE' then
      if old.owner_id <> new.owner_id then raise exception 'billing_storage_move_not_supported'; end if;
      v_growth := v_growth - case when old.state <> 'deleted' then old.byte_size else 0 end;
    end if;
  end if;
  if v_growth <= 0 then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text,501));
  v_limit := (billing_private.limits(v_owner)->>'bytes')::bigint;
  v_total := billing_private.storage_bytes(v_owner);
  if v_total + v_growth > v_limit then raise exception 'billing_storage_limit'; end if;
  return new;
end;
$$;
revoke all on function billing_private.enforce_storage() from public, anon, authenticated;
create trigger billing_r2_storage_limit before insert or update on public.r2_gateway_objects for each row execute function billing_private.enforce_storage();
create trigger billing_supabase_storage_limit before insert or update on storage.objects for each row execute function billing_private.enforce_storage();

create function billing_private.enforce_storefront()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_old integer := 0; v_new integer;
begin
  if new.published is null then return new; end if;
  if tg_op='UPDATE' and old.published is not null then v_old := jsonb_array_length(old.published->'itemIds'); end if;
  v_new := jsonb_array_length(new.published->'itemIds');
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,501));
  v_limit := (billing_private.limits(new.owner_id)->>'items')::integer;
  -- Preserve already-published work on expiration; block growth above quota.
  if v_new > v_limit and v_new > v_old then raise exception 'billing_item_limit'; end if;
  return new;
end;
$$;
revoke all on function billing_private.enforce_storefront() from public, anon, authenticated;
create trigger billing_storefront_item_limit before insert or update on public.storefronts for each row execute function billing_private.enforce_storefront();

-- Raise the technical document envelope to the largest selected offer.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.valid_storefront_document(jsonb)'::regprocedure) into v_definition;
  if position('<= 60' in v_definition) > 0 then execute replace(v_definition,'<= 60','<= 100'); end if;
end;
$$;
