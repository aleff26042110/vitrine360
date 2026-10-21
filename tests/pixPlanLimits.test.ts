import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

it('paid capacity: combine R2 + Supabase, keep existing content on expiry, enforce published item growth', async () => {
  const db = new PGlite()
  const owner = '00000000-0000-4000-8000-000000000001'
  const other = '00000000-0000-4000-8000-000000000002'
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create schema storage; create table storage.objects(bucket_id text,name text,metadata jsonb default '{}',primary key(bucket_id,name));
      create table public.r2_gateway_objects(owner_id uuid,path text primary key,byte_size bigint,state text);
      create table public.r2_gateway_budget(max_bytes bigint);
      create function public.r2_gateway(p_action text,p_owner uuid,p_bucket text,p_path text,p_bytes bigint,p_mime text,p_lease uuid,p_upload_id text) returns jsonb language plpgsql as $$
      declare v_bytes bigint := 0; v_budget public.r2_gateway_budget;
      begin v_budget.max_bytes := 8000000000;
        if v_bytes + p_bytes > v_budget.max_bytes then raise exception 'r2_storage_limit'; end if;
        return '{}'::jsonb;
      end; $$;
      create table public.storefronts(owner_id uuid primary key,published jsonb);
      create function public.valid_storefront_document(p jsonb) returns boolean language sql as $$ select jsonb_array_length(p->'itemIds') <= 60 $$;
      insert into auth.users values('${owner}'),('${other}');`)
    for (const name of ['20261020225552_pix_billing.sql','20261020231149_pix_plan_limits.sql','20261020231709_pix_storage_paid_capacity.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'))
    await db.query('insert into public.r2_gateway_objects values($1,$2,200000000,\'uploading\')',[owner,'first'])
    await expect(db.query('insert into storage.objects values($1,$2,$3)', ['vitrine360-private',`${owner}/large`,JSON.stringify({ size: 60000000 })])).rejects.toThrow(/storage_limit/)
    await db.query('insert into storage.objects values($1,$2,$3)', ['vitrine360-private',`${owner}/small`,JSON.stringify({ size: 40000000 })])
    const begin = (await db.query<{ v: { id: string } }>("select public.billing_pix('begin',$1,'essential',null,$2) v",[owner,JSON.stringify({ email: 'fixture@example.invalid' })])).rows[0].v
    await db.query("select public.billing_pix('update',null,null,$1,$2)",[begin.id,JSON.stringify({order_id:'ORD1234567890',status:'paid'})])
    await db.query("select public.r2_gateway('reserve',$1,null,null,8500000000,null,null,null)",[owner])
    await db.query('insert into public.r2_gateway_objects values($1,$2,600000000,\'ready\')',[owner,'paid-space'])
    const doc = (n: number) => JSON.stringify({ itemIds: Array.from({length:n},(_,i)=>String(i)) })
    await db.query('insert into public.storefronts values($1,$2)',[owner,doc(10)])
    await expect(db.query('update public.storefronts set published=$1 where owner_id=$2',[doc(11),owner])).rejects.toThrow(/item_limit/)
    await expect(db.query('insert into public.storefronts values($1,$2)',[other,doc(4)])).rejects.toThrow(/item_limit/)
    await db.query("update public.billing_pix_access set valid_until=now()-interval '1 second' where owner_id=$1",[owner])
    await expect(db.query("select public.r2_gateway('reserve',$1,null,null,8500000000,null,null,null)",[owner])).rejects.toThrow(/r2_storage_limit/)
    await db.query('update public.storefronts set published=$1 where owner_id=$2',[doc(10),owner])
    expect((await db.query('select * from public.r2_gateway_objects')).rows).toHaveLength(2)
    await expect(db.query('insert into public.r2_gateway_objects values($1,$2,1,\'ready\')',[owner,'over-expired'])).rejects.toThrow(/storage_limit/)
    await db.query("update public.r2_gateway_objects set state='deleted' where path='paid-space'")
    await db.query('update public.storefronts set published=$1 where owner_id=$2',[doc(3),owner])
    expect((await db.query<{ ok:boolean }>('select public.valid_storefront_document($1) ok',[doc(100)])).rows[0].ok).toBe(true)
    await db.exec('set role authenticated')
    await expect(db.query('select billing_private.limits($1)',[owner])).rejects.toThrow(/permission denied/)
  } finally { await db.close() }
},30000)
