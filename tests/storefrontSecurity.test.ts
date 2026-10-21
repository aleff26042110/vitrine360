import { readFile } from 'node:fs/promises'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { defaultStorefront } from '../src/storefront'

const ownerA = '00000000-0000-4000-8000-000000000001'
const ownerB = '00000000-0000-4000-8000-000000000002'
const itemA = '10000000-0000-4000-8000-000000000001'
const itemB = '10000000-0000-4000-8000-000000000002'
const itemPrivate = '10000000-0000-4000-8000-000000000003'
const document = { ...defaultStorefront, name: 'Marca A', slug: 'marca-a', itemIds: [itemA] }
let db: PGlite
async function actAs(id: string, role = 'authenticated') { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role ${role};`) }

describe('storefront publication privacy and ownership', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      insert into auth.users values('${ownerA}'),('${ownerB}');
      create table public.product_spins(id uuid primary key, owner_id uuid, spin_kind text);
      create table public.showcase_publications(id uuid primary key, owner_id uuid, kind text, spin_id uuid, title text, description text, price_label text, slug text, asset_paths text[], publication_status text);
      insert into public.product_spins values('${itemA}','${ownerA}','vehicle'),('${itemB}','${ownerB}','product');
      insert into public.showcase_publications values
        ('${itemA}','${ownerA}','product_spin','${itemA}','Veículo A','Descrição','R$ 10','veiculo-a',array['owner-a/frame.jpg'],'published'),
        ('${itemB}','${ownerB}','product_spin','${itemB}','Objeto B','','','objeto-b',array['owner-b/frame.jpg'],'published'),
        ('${itemPrivate}','${ownerA}','product_spin',null,'Privado','','','privado',array['owner-a/private.jpg'],'disabled');
      alter table public.showcase_publications enable row level security;
      create policy own_publications on public.showcase_publications to authenticated using (auth.uid() = owner_id);
      grant select on public.showcase_publications to authenticated;
    `)
    const sql = await readFile(new URL('../supabase/migrations/20261016045827_personalized_storefronts.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
  }, 30000)
  afterAll(async () => { await db?.close() })
  beforeEach(async () => { await db.exec('begin;'); await actAs(ownerA) })
  afterEach(async () => { await db.exec('rollback; reset role;') })

  it('publishes an explicit snapshot, preserves it during draft edits, and withdraws it without deleting the draft', async () => {
    await db.query('select public.publish_storefront($1::jsonb)', [JSON.stringify(document)])
    await db.query('select public.save_storefront_draft($1::jsonb)', [JSON.stringify({ ...document, name: 'Rascunho novo', template: 'gallery' })])
    await actAs('', 'anon')
    const result = await db.query<{ value: { document: { name: string; itemIds?: string[] }; items: { title: string; spin_kind: string }[] } }>("select public.load_public_storefront('marca-a') as value")
    expect(result.rows[0].value.document.name).toBe('Marca A')
    expect(result.rows[0].value.document.itemIds).toBeUndefined()
    expect(result.rows[0].value.items[0].spin_kind).toBe('vehicle')
    await actAs(ownerA)
    await db.exec('update public.storefronts set published = null;')
    expect((await db.query<{ draft: { name: string } }>('select draft from public.storefronts')).rows[0].draft.name).toBe('Rascunho novo')
    await actAs('', 'anon')
    expect((await db.query<{ value: unknown }>("select public.load_public_storefront('marca-a') as value")).rows[0].value).toBeNull()
  })
  it('isolates another creator from reading or rewriting a private draft', async () => {
    await db.query('select public.save_storefront_draft($1::jsonb)', [JSON.stringify(document)])
    await actAs(ownerB)
    expect((await db.query('select * from public.storefronts')).rows).toHaveLength(0)
    expect((await db.query("update public.storefronts set slug='hijacked' returning owner_id")).rows).toHaveLength(0)
    await expect(db.query('insert into public.storefronts(owner_id,draft) values($1,$2::jsonb)', [ownerA, JSON.stringify(document)])).rejects.toThrow()
  })
  it('rejects foreign published items even if their identifiers are known', async () => {
    await expect(db.query('select public.publish_storefront($1::jsonb)', [JSON.stringify({ ...document, itemIds: [itemB] })])).rejects.toThrow(/owned_and_published/)
  })
  it('rejects disabled items and keeps them out of public output', async () => {
    await expect(db.query('select public.publish_storefront($1::jsonb)', [JSON.stringify({ ...document, itemIds: [itemPrivate] })])).rejects.toThrow(/owned_and_published/)
  })
  it('filters foreign and withdrawn content even if an owner writes a malicious public snapshot directly', async () => {
    const tampered = { ...document, itemIds: [itemA, itemB, itemPrivate] }
    await db.query('insert into public.storefronts(owner_id,slug,draft,published) values($1,$2,$3::jsonb,$3::jsonb)', [ownerA, document.slug, JSON.stringify(tampered)])
    await actAs('', 'anon')
    const result = await db.query<{ value: { items: { id: string }[] } }>("select public.load_public_storefront('marca-a') as value")
    expect(result.rows[0].value.items.map(item => item.id)).toEqual([itemA])
  })
  it('publishes without an explicit slug by generating one from the storefront name', async () => {
    const draftWithoutSlug = { ...document, slug: '', name: 'Minha Vitrine!', itemIds: [itemA] }
    await db.query('select public.publish_storefront($1::jsonb)', [JSON.stringify(draftWithoutSlug)])
    expect((await db.query<{ slug: string }>('select slug from public.storefronts')).rows[0].slug).toBe('minha-vitrine')
    await actAs('', 'anon')
    const result = await db.query<{ value: { document: { name: string } } }>("select public.load_public_storefront('minha-vitrine') as value")
    expect(result.rows[0].value).not.toBeNull()
    expect(result.rows[0].value?.document?.name).toBe('Minha Vitrine!')
  })
  it('never grants anonymous clients direct access to draft rows', async () => {
    await actAs('', 'anon')
    await expect(db.query('select * from public.storefronts')).rejects.toThrow(/permission denied/)
  })
})
