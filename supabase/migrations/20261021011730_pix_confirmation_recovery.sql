-- Retry pending confirmations even when every browser is closed.
alter table public.billing_pix_invoices add column reconcile_attempt_at timestamptz;
create table billing_private.reconcile_config (
  singleton boolean primary key default true check(singleton),
  token_hash bytea not null,
  next_run timestamptz not null default '-infinity'
);
alter table billing_private.reconcile_config enable row level security;
revoke all on billing_private.reconcile_config from public, anon, authenticated, service_role;

-- Generate the scheduler credential inside the database, encrypt it in Vault,
-- and retain only its digest in the claim gate. No secret in source or client.
do $$
declare v_token text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name='vitrine360_pix_reconcile_key' limit 1;
  if v_token is null then
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
    perform vault.create_secret(v_token,'vitrine360_pix_reconcile_key','Pix reconciliation scheduler');
  end if;
  insert into billing_private.reconcile_config(singleton,token_hash) values(true,sha256(convert_to(v_token,'UTF8')));
end;
$$;

create function billing_private.claim_reconciliation(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_config billing_private.reconcile_config; v_result jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'billing_reconcile_forbidden'; end if;
  select * into strict v_config from billing_private.reconcile_config where singleton for update;
  if sha256(convert_to(p_token,'UTF8')) <> v_config.token_hash then raise exception 'billing_reconcile_forbidden'; end if;
  if v_config.next_run > now() then return '[]'::jsonb; end if;
  update billing_private.reconcile_config set next_run=now()+interval '45 seconds' where singleton;
  with selected as (
    select id from public.billing_pix_invoices where status in ('creating','pending') and provider_order_id is not null
    order by reconcile_attempt_at nulls first,created_at limit 10 for update skip locked
  ), claimed as (
    update public.billing_pix_invoices i set reconcile_attempt_at=now() from selected s where i.id=s.id returning i.*
  ) select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into v_result from claimed c;
  return v_result;
end;
$$;
revoke all on function billing_private.claim_reconciliation(text) from public, anon, authenticated;
grant usage on schema billing_private to service_role;
grant execute on function billing_private.claim_reconciliation(text) to service_role;
create function public.billing_pix_reconcile(p_token text)
returns jsonb language sql security invoker set search_path='' as $$select billing_private.claim_reconciliation(p_token);$$;
revoke all on function public.billing_pix_reconcile(text) from public, anon, authenticated;
grant execute on function public.billing_pix_reconcile(text) to service_role;
