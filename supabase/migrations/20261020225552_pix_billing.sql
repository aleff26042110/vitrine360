-- Only the trusted payment backend writes invoices or confirms paid access.
create table public.billing_pix_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  plan_key text not null check (plan_key in ('essential','professional','business')),
  amount_cents integer not null check (amount_cents > 0),
  payer_email text not null check (length(payer_email) between 3 and 254),
  status text not null default 'creating' check (status in ('creating','pending','paid','expired','canceled','failed','refunded')),
  provider_order_id text unique,
  qr_code text,
  qr_code_base64 text,
  expires_at timestamptz,
  granted_at timestamptz,
  access_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index billing_pix_one_open_invoice on public.billing_pix_invoices(owner_id) where status in ('creating','pending');
alter table public.billing_pix_invoices enable row level security;
revoke all on public.billing_pix_invoices from public, anon, authenticated;
grant select on public.billing_pix_invoices to authenticated;
grant all on public.billing_pix_invoices to service_role;
create policy "Owners read only their Pix invoices" on public.billing_pix_invoices for select to authenticated using ((select auth.uid()) = owner_id);

-- Separate from legacy subscriptions: no reinterpretation of free/studio/teams.
create table public.billing_pix_access (
  owner_id uuid primary key references auth.users(id),
  plan_key text not null check (plan_key in ('essential','professional','business')),
  invoice_id uuid not null unique references public.billing_pix_invoices(id),
  valid_until timestamptz not null
);
alter table public.billing_pix_access enable row level security;
revoke all on public.billing_pix_access from public, anon, authenticated;
grant select on public.billing_pix_access to authenticated;
grant all on public.billing_pix_access to service_role;
create policy "Owners read only their paid access" on public.billing_pix_access for select to authenticated using ((select auth.uid()) = owner_id);

create function public.billing_pix(p_action text, p_owner uuid default null, p_plan text default null, p_id uuid default null, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v public.billing_pix_invoices; v_amount integer; v_until timestamptz;
begin
  if p_action = 'begin' then
    v_amount := case p_plan when 'essential' then 1990 when 'professional' then 3990 when 'business' then 7990 end;
    if p_owner is null or v_amount is null then raise exception 'billing_invalid_plan'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 501));
    select * into v from public.billing_pix_invoices where owner_id = p_owner and status in ('creating','pending') order by created_at desc limit 1;
    if found then
      if v.plan_key <> p_plan then raise exception 'billing_existing_invoice'; end if;
      return to_jsonb(v);
    end if;
    if exists(select 1 from public.billing_pix_access where owner_id = p_owner and valid_until > now()) then raise exception 'billing_already_active'; end if;
    -- Limit new failed/expired attempts, including requests across Worker instances.
    if (select count(*) from public.billing_pix_invoices where owner_id = p_owner and created_at > now() - interval '1 hour') >= 6 then raise exception 'billing_rate_limit'; end if;
    insert into public.billing_pix_invoices(owner_id,plan_key,amount_cents,payer_email) values(p_owner,p_plan,v_amount,p_data->>'email') returning * into v;
    return to_jsonb(v);
  elsif p_action = 'get' then
    select * into v from public.billing_pix_invoices where id = p_id and owner_id = p_owner;
  elsif p_action = 'order' then
    select * into v from public.billing_pix_invoices where provider_order_id = p_data->>'order_id';
  elsif p_action = 'update' then
    select * into v from public.billing_pix_invoices where id = p_id for update;
    if not found then raise exception 'billing_not_found'; end if;
    if v.provider_order_id is not null and v.provider_order_id <> p_data->>'order_id' then raise exception 'billing_order_mismatch'; end if;
    if p_data->>'status' not in ('pending','paid','expired','canceled','failed','refunded') then raise exception 'billing_invalid_status'; end if;
    -- Once paid, pending/expired retries must not revoke or grant access twice.
    if v.status in ('paid','refunded') and p_data->>'status' not in ('paid','refunded') then return to_jsonb(v); end if;
    if v.status = 'refunded' then return to_jsonb(v); end if;
    update public.billing_pix_invoices set
      provider_order_id = p_data->>'order_id', status = p_data->>'status',
      qr_code = coalesce(p_data->>'qr_code', qr_code), qr_code_base64 = coalesce(p_data->>'qr_code_base64', qr_code_base64),
      expires_at = coalesce((p_data->>'expires_at')::timestamptz, expires_at), updated_at = now()
      where id = v.id returning * into v;
    if v.status = 'paid' and v.granted_at is null then
      v_until := now() + interval '1 month';
      insert into public.billing_pix_access(owner_id,plan_key,invoice_id,valid_until) values(v.owner_id,v.plan_key,v.id,v_until)
      on conflict(owner_id) do update set plan_key = excluded.plan_key, invoice_id = excluded.invoice_id, valid_until = excluded.valid_until;
      update public.billing_pix_invoices set granted_at = now(), access_until = v_until where id = v.id returning * into v;
    elsif v.status = 'refunded' then
      delete from public.billing_pix_access where invoice_id = v.id;
    end if;
    return to_jsonb(v);
  else raise exception 'billing_invalid_action';
  end if;
  if v.id is null then raise exception 'billing_not_found'; end if;
  return to_jsonb(v);
end;
$$;
revoke all on function public.billing_pix(text,uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.billing_pix(text,uuid,text,uuid,jsonb) to service_role;
