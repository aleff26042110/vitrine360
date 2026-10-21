-- net queues are extension-owned and may retain PUBLIC grants. Put no
-- reusable application credential in them: jobs carry short, single-use tickets.
alter table billing_private.reconcile_config add column ticket_expires_at timestamptz not null default '-infinity';
update billing_private.reconcile_config set token_hash=sha256(convert_to(gen_random_uuid()::text,'UTF8')),next_run='-infinity';

create or replace function billing_private.claim_reconciliation(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_config billing_private.reconcile_config; v_result jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'billing_reconcile_forbidden'; end if;
  select * into strict v_config from billing_private.reconcile_config where singleton for update;
  if v_config.ticket_expires_at <= now() or sha256(convert_to(p_token,'UTF8')) <> v_config.token_hash then raise exception 'billing_reconcile_forbidden'; end if;
  if v_config.next_run > now() then return '[]'::jsonb; end if;
  -- Consume before any provider access. A replay cannot perform another batch.
  update billing_private.reconcile_config set next_run=now()+interval '45 seconds',ticket_expires_at='-infinity',token_hash=sha256(convert_to(gen_random_uuid()::text,'UTF8')) where singleton;
  with selected as (
    select id from public.billing_pix_invoices where status in ('creating','pending') and provider_order_id is not null
    order by reconcile_attempt_at nulls first,created_at limit 10 for update skip locked
  ), claimed as (
    update public.billing_pix_invoices i set reconcile_attempt_at=now() from selected s where i.id=s.id returning i.*
  ) select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into v_result from claimed c;
  return v_result;
end;
$$;

create function billing_private.enqueue_reconciliation()
returns bigint language plpgsql security definer set search_path='' as $$
declare v_config billing_private.reconcile_config; v_ticket text; v_request bigint;
begin
  if not exists(select 1 from public.billing_pix_invoices where status in ('creating','pending') and provider_order_id is not null) then return null; end if;
  select * into strict v_config from billing_private.reconcile_config where singleton for update;
  if v_config.next_run > now() or v_config.ticket_expires_at > now() then return null; end if;
  v_ticket := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
  update billing_private.reconcile_config set token_hash=sha256(convert_to(v_ticket,'UTF8')),ticket_expires_at=now()+interval '2 minutes' where singleton;
  select net.http_post(
    url := 'https://msovfbuhehaiousuzbwr.supabase.co/functions/v1/pix-billing/reconcile',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_ticket),body := '{}'::jsonb,timeout_milliseconds := 10000
  ) into v_request;
  return v_request;
end;
$$;
revoke all on function billing_private.enqueue_reconciliation() from public,anon,authenticated,service_role;
select cron.schedule('vitrine360-pix-reconcile','* * * * *','select billing_private.enqueue_reconciliation();');
