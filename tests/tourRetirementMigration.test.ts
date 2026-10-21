import { readFile, readdir } from 'node:fs/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

const owner = '00000000-0000-4000-8000-000000000001'
const foreign = '00000000-0000-4000-8000-000000000002'
const tour = '00000000-0000-4000-8000-000000000601'
const scene = '00000000-0000-4000-8000-000000000602'
const revision = '00000000-0000-4000-8000-000000000603'
const draftRevision = '00000000-0000-4000-8000-000000000604'
const privatePath = `r2:${owner}/${tour}/${scene}/${revision}/original`
const publicPath = `r2:${owner}/${tour}/${scene}/${revision}/published`
const draftPath = `r2:${owner}/${tour}/${scene}/${draftRevision}/original`

describe('atomic tour retirement SQL', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      create schema storage; grant usage on schema storage to anon,authenticated;
      create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text not null,name text not null,primary key(bucket_id,name));
      alter table storage.objects enable row level security; grant select on storage.objects to anon;
      create function storage.foldername(path text) returns text[] language sql immutable as $$ select (string_to_array(path,'/'))[1:greatest(array_length(string_to_array(path,'/'),1)-1,0)] $$;
    `)
    const directory = new URL('../supabase/migrations/', import.meta.url)
    const files = (await readdir(directory)).filter(name => /^\d{4}_/.test(name) || name.endsWith('_atomic_tour_retirement.sql')).sort()
    for (const file of files) await db.exec(await readFile(new URL(file, directory), 'utf8'))
  }, 60000)

  afterAll(async () => { await db?.close() })

  async function asUser(user: string | null = owner) {
    await db.exec(`reset role; set role authenticated;`)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ''])
  }
  const retire = (remove: boolean) => db.query<{ result: { id: string; deleted: boolean; cleanup_pending: boolean } }>('select public.retire_tour($1,$2) as result', [tour, remove])
  const rows = async (table: string) => (await db.query(`select * from public.${table}`)).rows

  beforeEach(async () => {
    await db.exec(`reset role; drop trigger if exists fail_test_cleanup on public.media_cleanup_queue; truncate auth.users cascade; truncate public.r2_gateway_objects;
      insert into auth.users(id) values('${owner}'),('${foreign}');`)
    await asUser()
    // Ready ledger entries remain accounted for until a reconciler confirms physical deletion.
    await db.exec('reset role;')
    for (const [bucket,path] of [['vitrine360-private',privatePath],['vitrine360-public',publicPath],['vitrine360-private',draftPath]]) {
      await db.query("insert into public.r2_gateway_objects(bucket,path,owner_id,byte_size,mime_type,upload_id,state) values($1,$2,$3,100,'image/jpeg','test-upload','ready')", [bucket,path.slice(3),owner])
    }
    await db.query("insert into public.projects(id,owner_id,title,status) values($1,$2,'Tour','published')", [tour,owner])
    await db.query("insert into public.scenes(id,project_id,position,title,media_path,public_media_path,width,height,projection) values($1,$2,0,'Sala',$3,$4,100,100,'flat')", [scene,tour,privatePath,publicPath])
    await db.query("update public.projects set initial_scene_id=$2,draft_manifest=$3::jsonb where id=$1", [tour,scene,JSON.stringify({ title: 'New draft', scenes: [{ id:scene,media_path:draftPath }], hotspots:[] })])
    await db.query("insert into public.publications(owner_id,project_id,slug,publication_status) values($1,$2::uuid,($2::uuid)::text,'published')", [owner,tour])
    await asUser()
  })

  it('unpublishes atomically, retains owner drafts and private media, and queues only public media', async () => {
    const receipt = (await retire(false)).rows[0].result
    expect(receipt).toMatchObject({ id:tour,deleted:false,cleanup_pending:true })
    expect((await db.query('select public.load_public_tour($1) as result',[tour])).rows[0].result).toBeNull()
    await db.exec('reset role;')
    expect((await rows('projects'))[0]).toMatchObject({ status:'draft',draft_manifest:{ title:'New draft',scenes:[{ id:scene,media_path:draftPath }],hotspots:[] } })
    expect((await rows('scenes'))[0]).toMatchObject({ media_path:privatePath,public_media_path:null })
    expect((await rows('publications'))[0]).toMatchObject({ publication_status:'disabled' })
    expect(await rows('media_cleanup_queue')).toEqual([expect.objectContaining({ bucket:'vitrine360-public',path:publicPath })])
    expect((await rows('r2_gateway_objects')).map(row => row.state)).toEqual(['ready','ready','ready'])
    await asUser(); await retire(false)
    await db.exec('reset role;')
    expect(await rows('media_cleanup_queue')).toHaveLength(1)
  })

  it('deletes published and draft-only references together and queues both private revisions', async () => {
    expect((await retire(true)).rows[0].result).toMatchObject({ id:tour,deleted:true,cleanup_pending:true })
    await db.exec('reset role;')
    for (const table of ['projects','scenes','publications']) expect(await rows(table)).toHaveLength(0)
    expect((await rows('media_cleanup_queue')).map(row => row.path).sort()).toEqual([privatePath,publicPath,draftPath].sort())
    expect((await rows('r2_gateway_objects')).map(row => row.state)).toEqual(['ready','ready','ready'])
  })

  it('denies a foreign owner, anonymous access, and an authenticated role without a user', async () => {
    await asUser(foreign)
    for (const remove of [false,true]) await expect(retire(remove)).rejects.toThrow(/tour_not_owned/)
    await asUser(null)
    await expect(retire(true)).rejects.toThrow(/auth_required/)
    await db.exec('reset role; set role anon;')
    await expect(retire(true)).rejects.toThrow(/permission denied/)
    await db.exec('reset role;')
    expect(await rows('media_cleanup_queue')).toHaveLength(0)
    expect((await rows('projects'))[0]).toMatchObject({ status:'published' })
    expect((await rows('scenes'))[0]).toMatchObject({ public_media_path:publicPath })
  })

  it('preserves associated models, spins, jobs, assets and their media', async () => {
    const asset = '00000000-0000-4000-8000-000000000610'
    const spin = '00000000-0000-4000-8000-000000000611'
    await db.exec('reset role;')
    await db.query("insert into public.media_assets(id,owner_id,project_id,storage_bucket,storage_path,asset_kind,original_name,mime_type,byte_size) values($1,$2,$3,'vitrine360-private',$4,'image','Shared image','image/jpeg',100)", [asset,owner,tour,privatePath])
    await db.query("insert into public.product_spins(id,owner_id,project_id,title,spin_kind) values($1,$2,$3,'Spin','product')", [spin,owner,tour])
    await db.query('insert into public.product_spin_frames(owner_id,spin_id,media_asset_id,position) values($1,$2,$3,0)', [owner,spin,asset])
    await db.query("insert into public.models_3d(owner_id,project_id,title) values($1,$2,'Model')", [owner,tour])
    await db.query("insert into public.reconstruction_jobs(owner_id,project_id,job_kind,provider) values($1,$2,'object_generation','tripo')", [owner,tour])
    await asUser(); await retire(true)
    await db.exec('reset role;')
    for (const table of ['media_assets','product_spins','models_3d','reconstruction_jobs']) {
      const remaining = await rows(table)
      expect(remaining).toHaveLength(1)
      expect(remaining[0]).toMatchObject({ owner_id:owner,project_id:null })
    }
    expect(await rows('product_spin_frames')).toHaveLength(1)
    expect((await rows('media_cleanup_queue')).map(row => row.path)).not.toContain(privatePath)
  })

  it('preserves media referenced by another tour', async () => {
    const otherTour = '00000000-0000-4000-8000-000000000620'
    await db.exec('reset role;')
    await db.query("insert into public.projects(id,owner_id,title) values($1,$2,'Other tour')", [otherTour,owner])
    await db.query("insert into public.scenes(project_id,position,title,media_path,public_media_path,width,height,projection) values($1,0,'Shared',$2,$3,100,100,'flat')", [otherTour,privatePath,publicPath])
    await asUser(); await retire(true)
    await db.exec('reset role;')
    expect((await rows('media_cleanup_queue')).map(row => row.path)).toEqual([draftPath])
    expect((await rows('scenes'))[0]).toMatchObject({ project_id:otherTour,media_path:privatePath,public_media_path:publicPath })
  })

  it('rolls back visibility, scene and draft references if queuing cleanup fails', async () => {
    await db.exec(`reset role;
      create or replace function public.fail_test_cleanup() returns trigger language plpgsql as $$ begin raise exception 'cleanup_unavailable'; end $$;
      create trigger fail_test_cleanup before insert on public.media_cleanup_queue for each row execute function public.fail_test_cleanup();`)
    for (const remove of [false,true]) {
      await asUser()
      await expect(retire(remove)).rejects.toThrow(/cleanup_unavailable/)
      await db.exec('reset role;')
      expect(await rows('media_cleanup_queue')).toHaveLength(0)
      expect((await rows('projects'))[0]).toMatchObject({ status:'published',draft_manifest:{ scenes:[{ media_path:draftPath }] } })
      expect((await rows('scenes'))[0]).toMatchObject({ media_path:privatePath,public_media_path:publicPath })
      expect((await rows('publications'))[0]).toMatchObject({ publication_status:'published' })
    }
  })
})
