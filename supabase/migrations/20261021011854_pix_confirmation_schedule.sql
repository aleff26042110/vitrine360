create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Requests are emitted only when there is a provider-linked pending invoice.
-- The bearer secret is decrypted inside Postgres, never embedded in this file.
select cron.schedule('vitrine360-pix-reconcile','* * * * *', $job$
  select net.http_post(
    url := 'https://msovfbuhehaiousuzbwr.supabase.co/functions/v1/pix-billing/reconcile',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name='vitrine360_pix_reconcile_key' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) where exists(select 1 from public.billing_pix_invoices where status in ('creating','pending') and provider_order_id is not null);
$job$);
