import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

it('Pix SQL: owner isolation, server-only confirmation, stable invoice, once-only month and refund revocation', async () => {
  const db = new PGlite()
  const owner = '00000000-0000-4000-8000-000000000001'
  const other = '00000000-0000-4000-8000-000000000002'
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated,service_role; grant execute on function auth.uid() to authenticated;
      insert into auth.users values('${owner}'),('${other}');`)
    await db.exec(await readFile(new URL('../supabase/migrations/20261020225552_pix_billing.sql', import.meta.url), 'utf8'))
    const call = async (action: string, who: string | null, plan: string | null, id: string | null, data: unknown = {}) => (await db.query<{ v: { id: string; status: string; access_until: string } }>('select public.billing_pix($1,$2,$3,$4,$5::jsonb) v',[action,who,plan,id,JSON.stringify(data)])).rows[0].v
    await db.exec('set role service_role')
    const invoice = await call('begin',owner,'essential',null,{ email: 'fixture@example.invalid' })
    expect((await call('begin',owner,'essential',null,{ email: 'changed@example.invalid' })).id).toBe(invoice.id)
    await expect(call('begin',owner,'business',null,{ email: 'fixture@example.invalid' })).rejects.toThrow(/existing_invoice/)
    await expect(call('get',other,null,invoice.id)).rejects.toThrow(/not_found/)
    const paid = await call('update',null,null,invoice.id,{ order_id: 'ORD1234567890', status: 'paid' })
    expect(paid.status).toBe('paid')
    expect((await call('update',null,null,invoice.id,{ order_id: 'ORD1234567890', status: 'paid' })).access_until).toBe(paid.access_until)
    expect((await call('update',null,null,invoice.id,{ order_id: 'ORD1234567890', status: 'pending' })).status).toBe('paid')
    await expect(call('begin',owner,'essential',null,{ email: 'fixture@example.invalid' })).rejects.toThrow(/already_active/)
    await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${other}',false)`)
    expect((await db.query('select * from public.billing_pix_invoices')).rows).toHaveLength(0)
    await expect(call('update',owner,null,invoice.id,{ order_id: 'ORD1234567890', status: 'paid' })).rejects.toThrow(/permission denied/)
    await db.exec(`reset role; set role service_role`)
    await call('update',null,null,invoice.id,{ order_id: 'ORD1234567890', status: 'refunded' })
    expect((await db.query('select * from public.billing_pix_access')).rows).toHaveLength(0)
    expect((await call('update',null,null,invoice.id,{ order_id: 'ORD1234567890', status: 'paid' })).status).toBe('refunded')
  } finally { await db.close() }
}, 30000)

it('all paid plans start a full calendar month at confirmation, never at QR creation', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      grant usage on schema public,auth to service_role;`)
    await db.exec(await readFile(new URL('../supabase/migrations/20261020225552_pix_billing.sql', import.meta.url), 'utf8'))
    for (const [index, plan] of ['essential', 'professional', 'business'].entries()) {
      const owner = `00000000-0000-4000-8000-00000000001${index}`
      await db.exec('reset role')
      await db.query('insert into auth.users values($1)', [owner])
      await db.exec('set role service_role')
      const call = async (action: string, id: string | null, data: unknown) => (await db.query<{
        v: { id: string; granted_at: string | null; access_until: string | null }
      }>('select public.billing_pix($1,$2,$3,$4,$5::jsonb) v', [action, owner, plan, id, JSON.stringify(data)])).rows[0].v
      const invoice = await call('begin', null, { email: 'fixture@example.invalid' })
      await db.query("update public.billing_pix_invoices set created_at = now() - interval '2 days' where id=$1", [invoice.id])
      const order_id = `ORD123456789${index}`
      const pending = await call('update', invoice.id, { order_id, status: 'pending' })
      expect(pending.granted_at).toBeNull()
      expect(pending.access_until).toBeNull()
      expect((await db.query('select * from public.billing_pix_access where owner_id=$1', [owner])).rows).toHaveLength(0)
      const paid = await call('update', invoice.id, { order_id, status: 'paid' })
      expect(paid.granted_at).toBeTruthy()
      const result = await db.query<{ correct: boolean }>(`select
        i.granted_at > i.created_at + interval '1 day'
        and i.granted_at between now() - interval '1 minute' and now()
        and i.access_until = i.granted_at + interval '1 month'
        and a.valid_until = i.access_until and a.plan_key = i.plan_key as correct
        from public.billing_pix_invoices i join public.billing_pix_access a on a.invoice_id=i.id where i.id=$1`, [invoice.id])
      expect(result.rows[0].correct).toBe(true)
      const replay = await call('update', invoice.id, { order_id, status: 'paid' })
      expect(replay.granted_at).toBe(paid.granted_at)
      expect(replay.access_until).toBe(paid.access_until)
    }
  } finally { await db.close() }
}, 30000)
