import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

it('scheduler: private credential, durable pending invoices, retry fairness, bounded claims and no client access', async () => {
  const db = new PGlite()
  const owner='00000000-0000-4000-8000-000000000001'
  let token='a'.repeat(64)
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema billing_private;
      create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      grant usage on schema public,auth to service_role; insert into auth.users values('${owner}');
      create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);
      insert into vault.decrypted_secrets values('vitrine360_pix_reconcile_key','${token}');
      create function vault.create_secret(s text,n text,d text) returns uuid language plpgsql as $$begin insert into vault.decrypted_secrets values(n,s); return gen_random_uuid(); end;$$;
      create schema cron; create function cron.schedule(n text,s text,c text) returns bigint language sql as $$select 1::bigint$$;
      create schema net; create table net.requests(id serial,headers jsonb);
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$declare v_id bigint; begin insert into net.requests(headers) values(headers) returning id into v_id; return v_id; end;$$;`)
    for (const name of ['20261020225552_pix_billing.sql','20261021011730_pix_confirmation_recovery.sql','20261021012531_pix_scheduler_single_use_tickets.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'))
    await db.query("insert into public.billing_pix_invoices(owner_id,plan_key,amount_cents,payer_email,status,provider_order_id) values($1,'essential',1990,'fixture@example.invalid','pending','ORD1234567890')",[owner])
    await db.query('select billing_private.enqueue_reconciliation()')
    token=(await db.query<{ bearer:string }>("select headers->>'Authorization' bearer from net.requests order by id desc limit 1")).rows[0].bearer.slice(7)
    await db.exec('set role service_role')
    const claim = async (value:string) => (await db.query<{ v: { id:string; reconcile_attempt_at:string }[] }>('select public.billing_pix_reconcile($1) v',[value])).rows[0].v
    await expect(claim('b'.repeat(64))).rejects.toThrow(/forbidden/)
    const batch = await claim(token)
    expect(batch).toHaveLength(1)
    expect(batch[0].reconcile_attempt_at).toBeTruthy()
    await expect(claim(token)).rejects.toThrow(/forbidden/)
    // A crash after acceptance leaves the invoice pending for the next run.
    await db.exec("reset role; update billing_private.reconcile_config set next_run='-infinity'")
    await db.query('select billing_private.enqueue_reconciliation()')
    const nextToken=(await db.query<{ bearer:string }>("select headers->>'Authorization' bearer from net.requests order by id desc limit 1")).rows[0].bearer.slice(7)
    expect(nextToken).not.toBe(token)
    token=nextToken
    await db.exec('set role service_role')
    expect((await claim(token))[0].id).toBe(batch[0].id)
    await db.exec('reset role; set role authenticated')
    await expect(claim(token)).rejects.toThrow(/permission denied/)
    await expect(db.query('select * from billing_private.reconcile_config')).rejects.toThrow(/permission denied/)
  } finally { await db.close() }
},30000)
