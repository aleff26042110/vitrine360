import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

const migrations = ['0001_initial.sql', '0002_public_tour_media.sql', '0003_media_ai_commercial.sql', '0004_tripo_object_generation.sql', '0005_public_3d_showcases.sql', '0006_public_profiles.sql', '0007_hotspot_media.sql', '0008_tour_analytics.sql', '0009_preserve_project_objects.sql', '0010_tour_interactions.sql', '0011_cloud_floorplans.sql', '0012_hotspot_scene_connections.sql', '0013_tour_editor_navigation.sql', '0014_spin_top_view.sql', '0015_tour_video_scenes.sql', '0016_r2_gateway_ledger.sql', '0017_r2_publication_paths.sql', '0018_site_administration.sql', '0019_atomic_tour_publication.sql']
migrations.push('0020_tour_drafts_and_media_references.sql')
const migrationPath = (name: string) => fileURLToPath(new URL(`../supabase/migrations/${name}`, import.meta.url))
const userA = '00000000-0000-4000-8000-000000000001'
const userB = '00000000-0000-4000-8000-000000000002'

describe('Supabase migrations and RLS contracts', () => {
  let db: PGlite

  beforeEach(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      create schema storage;
      grant usage on schema storage to anon, authenticated;
      create table storage.buckets (
        id text primary key, name text not null, public boolean not null default false,
        file_size_limit bigint, allowed_mime_types text[]
      );
      create table storage.objects (bucket_id text not null, name text not null, primary key(bucket_id, name));
      alter table storage.objects enable row level security;
      grant select on storage.objects to anon;
      create function storage.foldername(path text) returns text[] language sql immutable as $$
        select (string_to_array(path, '/'))[1:greatest(array_length(string_to_array(path, '/'), 1) - 1, 0)]
      $$;
    `)
  }, 30000)

  afterEach(async () => { await db.close() })

  it('cuts over a tour atomically, preserves identities and analytics, rejects stale/foreign revisions and queues old media', async () => {
    for (const file of migrations) await db.exec(await readFile(migrationPath(file), 'utf8'))
    const project = '00000000-0000-4000-8000-000000000401', a = '00000000-0000-4000-8000-000000000402', b = '00000000-0000-4000-8000-000000000403', spot = '00000000-0000-4000-8000-000000000404'
    const first = '00000000-0000-4000-8000-000000000405', second = '00000000-0000-4000-8000-000000000406', third = '00000000-0000-4000-8000-000000000407'
    const scenes = (revision: string) => [a,b].map((id,index) => ({ id, title: `Sala ${index}`, media_path: `${userA}/${project}/${id}/${revision}/original`, public_media_path: `${userA}/${project}/${id}/${revision}/published`, width: 4096, height: 2048, projection: 'equirectangular', media_kind: 'image', approximate: false, north_offset: 0, byte_size: 100, mime_type: 'image/jpeg' }))
    const hotspots = [{ id: spot, scene_id: a, target_scene_id: b, yaw: 0, pitch: 0, title: 'Ir', description: '', spot_kind: 'link', icon_style: 'arrow', icon_scale: 1 }]
    const commit = (revision: string, baseline: string | null, values = scenes(revision), hs: unknown[] = hotspots) => db.query("select public.commit_tour_revision($1,$2,$3,'Tour revisado',true,$4,$5::jsonb,$6::jsonb) as result", [project,revision,baseline,a,JSON.stringify(values),JSON.stringify(hs)])
    await db.exec(`insert into auth.users(id) values('${userA}'),('${userB}');`)
    for (const revision of [first,second,third]) for (const scene of scenes(revision)) await db.query('insert into storage.objects(bucket_id,name) values($1,$2),($3,$4)', ['vitrine360-private',scene.media_path,'vitrine360-public',scene.public_media_path])
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${userA}',false);`)
    await commit(first,null)
    await commit(first,null) // Same revision and payload: receipt is idempotent.
    await expect(commit(first,null,scenes(first),[{ ...hotspots[0], title: 'Different payload' }])).rejects.toThrow(/tour_revision_reused/)
    const read = () => db.query<{ value: { scenes: { id: string; public_media_path: string }[]; hotspots: { id: string }[] } }>('select public.load_public_tour($1) as value',[project])
    const initial = (await read()).rows[0].value
    await expect(commit(second,first,scenes(second),[{ ...hotspots[0], embed_url: 'https://evil.example/iframe' }])).rejects.toThrow(/hotspots_embed_url_valid/)
    expect((await read()).rows[0].value).toEqual(initial)
    await db.exec(`reset role; insert into public.analytics_events(publication_id,event_kind,scene_id) select id,'scene_change','${a}' from public.publications where project_id='${project}'; set role authenticated;`)
    await commit(second,first,scenes(second).reverse())
    const current = (await read()).rows[0].value
    expect(current.scenes.map(scene => scene.id)).toEqual([b,a])
    expect(current.hotspots.map(h => h.id)).toEqual([spot])
    await expect(commit(third,first)).rejects.toThrow(/tour_revision_conflict/)
    await expect(commit(third,null)).rejects.toThrow(/tour_revision_conflict/)
    expect((await read()).rows[0].value).toEqual(current)
    await db.exec(`select set_config('request.jwt.claim.sub','${userB}',false);`)
    await expect(commit(third,second)).rejects.toThrow(/tour_not_owned/)
    await expect(db.query('select * from public.media_cleanup_queue')).rejects.toThrow(/permission denied/)
    const foreignUsage = (await db.query<{ result: { reserved_bytes: number; pending_cleanup: number } }>('select public.account_storage_usage() as result')).rows[0].result
    expect(foreignUsage).toMatchObject({ reserved_bytes: 0, pending_cleanup: 0 })
    await db.exec('reset role;')
    expect((await db.query<{ scene_id: string }>('select scene_id from public.analytics_events')).rows[0].scene_id).toBe(a)
    expect((await db.query('select * from public.media_cleanup_queue')).rows).toHaveLength(4)
    await db.exec(`set role anon;`)
    expect((await read()).rows[0].value.scenes.map(scene => scene.id)).toEqual([b,a])
    await expect(commit(third,second)).rejects.toThrow(/permission denied/)
    await db.exec(`reset role; update public.publications set visibility='private' where project_id='${project}'; set role anon;`)
    expect((await read()).rows[0].value).toBeNull()
  })

  it('requires confirmed R2 media and owner-only usage; refuses foreign cleanup requests', async () => {
    for (const file of migrations) await db.exec(await readFile(migrationPath(file), 'utf8'))
    const project = '00000000-0000-4000-8000-000000000411', scene = '00000000-0000-4000-8000-000000000412', revision = '00000000-0000-4000-8000-000000000413'
    const path = `${userA}/${project}/${scene}/${revision}/original`
    const payload = JSON.stringify([{ id: scene, title: 'Sala', media_path: `r2:${path}`, width: 100, height: 100, projection: 'flat', media_kind: 'image', byte_size: 123, mime_type: 'image/jpeg' }])
    const commit = () => db.query("select public.commit_tour_revision($1,$2,null,'Draft',false,$3,$4::jsonb,'[]')",[project,revision,scene,payload])
    await db.exec(`insert into auth.users(id) values('${userA}'),('${userB}'); set role authenticated; select set_config('request.jwt.claim.sub','${userA}',false);`)
    await expect(commit()).rejects.toThrow(/tour_media_not_ready/)
    expect((await db.query('select * from public.projects')).rows).toHaveLength(0)
    await db.exec(`reset role; insert into public.r2_gateway_objects(bucket,path,owner_id,byte_size,mime_type,upload_id,state) values('vitrine360-private','${path}','${userA}',123,'image/jpeg','upload','uploading'); set role authenticated;`)
    await expect(commit()).rejects.toThrow(/tour_media_not_ready/)
    await db.exec(`reset role; update public.r2_gateway_objects set state='ready'; set role authenticated;`)
    await commit()
    const usage = () => db.query<{ result: { reserved_bytes: number; ready_bytes: number } }>('select public.account_storage_usage() as result')
    expect((await usage()).rows[0].result).toMatchObject({ reserved_bytes: 123, ready_bytes: 123 })
    await expect(db.query('select public.queue_tour_upload_cleanup($1,$2)', ['vitrine360-private',[path.replace(userA,userB)]])).rejects.toThrow(/invalid_cleanup_path/)
    await db.exec(`select set_config('request.jwt.claim.sub','${userB}',false);`)
    expect((await usage()).rows[0].result).toMatchObject({ reserved_bytes: 0, ready_bytes: 0 })
  })

  it('requires server-managed administrator membership and revokes it immediately', async () => {
    for (const file of migrations) await db.exec(await readFile(migrationPath(file), 'utf8'))
    await db.exec(await readFile(migrationPath('0018_site_administration.sql'), 'utf8'))
    await db.exec(`insert into auth.users(id,raw_user_meta_data) values('${userA}','{"role":"admin"}'),('${userB}','{}');
      insert into public.projects(owner_id,title) values('${userB}','Other owner project'); set role anon;`)
    await expect(db.query('select public.site_admin_overview()')).rejects.toThrow(/permission denied/)
    await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${userA}',false);`)
    expect((await db.query<{ result: boolean }>('select public.is_site_administrator() as result')).rows[0].result).toBe(false)
    await expect(db.query('select public.site_admin_overview()')).rejects.toThrow(/admin_required/)
    await expect(db.query(`insert into public.site_administrators(user_id) values('${userA}')`)).rejects.toThrow(/permission denied/)
    await expect(db.query('select * from public.site_administrators')).rejects.toThrow(/permission denied/)
    await db.exec(`reset role; set role service_role; insert into public.site_administrators(user_id) values('${userA}'); reset role; set role authenticated;`)
    expect((await db.query<{ result: boolean }>('select public.is_site_administrator() as result')).rows[0].result).toBe(true)
    const report = (await db.query<{ result: { users: number; tours: number; storage: { max_bytes: number }; recent_projects: { title: string }[] } }>('select public.site_admin_overview() as result')).rows[0].result
    expect(report).toMatchObject({ users: 2, tours: 1, storage: { max_bytes: 8000000000 } })
    expect(report.recent_projects[0].title).toBe('Other owner project')
    expect((await db.query('select * from public.projects')).rows).toHaveLength(0)
    await db.exec(`select set_config('request.jwt.claim.sub','${userB}',false);`)
    await expect(db.query('select public.site_admin_overview()')).rejects.toThrow(/admin_required/)
    await db.exec(`reset role; delete from public.site_administrators where user_id='${userA}'; set role authenticated; select set_config('request.jwt.claim.sub','${userA}',false);`)
    await expect(db.query('select public.site_admin_overview()')).rejects.toThrow(/admin_required/)
  })

  it('publishes only server-confirmed R2 files with matching owner, bytes and MIME while preserving legacy paths', async () => {
    for (const file of migrations) await db.exec(await readFile(migrationPath(file), 'utf8'))
    const model = '00000000-0000-4000-8000-000000000311'
    const revision = '00000000-0000-4000-8000-000000000312'
    const asset = '00000000-0000-4000-8000-000000000313'
    const path = `${userA}/showcases/${model}/${revision}/0.glb`
    const publish = (size = 1024) => db.query(`select public.publish_showcase(
      'model_3d','${model}','model-r2-verified','Modelo R2','',null,'#f4f6f2',
      array['${asset}'::uuid],array['r2:${path}'],array['modelo.glb'],array['model/gltf-binary'],array[${size}::bigint]
    )`)
    await db.exec(`insert into auth.users(id) values('${userA}'),('${userB}'); set role authenticated; select set_config('request.jwt.claim.sub','${userA}',false);`)
    await expect(publish()).rejects.toThrow(/r2_asset_not_ready/)
    await db.exec(`reset role;
      insert into public.r2_gateway_objects(bucket,path,owner_id,byte_size,mime_type,upload_id,state)
      values('vitrine360-public','${path}','${userA}',1024,'model/gltf-binary','upload-model','uploading');
      set role authenticated;`)
    await expect(publish()).rejects.toThrow(/r2_asset_not_ready/)
    await db.exec(`reset role; update public.r2_gateway_objects set state='ready'; set role authenticated;`)
    await expect(publish(1025)).rejects.toThrow(/r2_asset_not_ready/)
    await publish()
    expect((await db.query<{ manifest: { assets: string[] } }>("select public.load_public_showcase('model-r2-verified') as manifest")).rows[0].manifest.assets).toEqual([`r2:${path}`])
    await db.exec(`select set_config('request.jwt.claim.sub','${userB}',false);`)
    expect((await db.query<{ ready: boolean }>(`select public.r2_asset_is_ready('vitrine360-public','${path}',1024,'model/gltf-binary') as ready`)).rows[0].ready).toBe(false)

    const project = '00000000-0000-4000-8000-000000000321'
    const scene = '00000000-0000-4000-8000-000000000322'
    const privatePath = `${userA}/${project}/${scene}/${revision}/original`
    await db.exec(`reset role; insert into public.projects(id,owner_id,title) values('${project}','${userA}','Tour R2');
      set role authenticated; select set_config('request.jwt.claim.sub','${userA}',false);`)
    const addScene = () => db.exec(`insert into public.scenes(id,project_id,position,title,media_path,width,height,projection)
      values('${scene}','${project}',0,'Sala','r2:${privatePath}',4000,2000,'equirectangular')`)
    await expect(addScene()).rejects.toThrow(/r2_asset_not_ready/)
    await db.exec(`reset role;
      insert into public.r2_gateway_objects(bucket,path,owner_id,byte_size,mime_type,upload_id,state)
      values('vitrine360-private','${privatePath}','${userA}',8,'image/jpeg','upload-photo','ready'); set role authenticated;`)
    await addScene()
    await expect(db.exec(`update public.scenes set public_media_path='r2:${privatePath.replace('/original','/published')}' where id='${scene}'`)).rejects.toThrow(/r2_asset_not_ready/)
  })

  it('keeps R2 reservations until confirmed cleanup and denies all client mutations', async () => {
    for (const file of migrations) await db.exec(await readFile(migrationPath(file), 'utf8'))
    const path = `${userA}/showcases/00000000-0000-4000-8000-000000000201/00000000-0000-4000-8000-000000000202/0.jpg`
    const otherPath = path.replace('0.jpg', '1.jpg')
    const lease = '00000000-0000-4000-8000-000000000203'
    const nextLease = '00000000-0000-4000-8000-000000000204'
    const call = (action: string, owner: string | null = userA, objectPath = path, bytes: number | null = null, token: string | null = null, uploadId: string | null = null) => db.query<{ result: { reserved_bytes: number; state: string } }>(
      'select public.r2_gateway($1,$2::uuid,$3,$4,$5::bigint,$6,$7::uuid,$8) as result',
      [action, owner, 'vitrine360-public', objectPath, bytes, 'image/jpeg', token, uploadId],
    )
    await db.exec('update public.r2_gateway_budget set max_bytes=10; set role anon;')
    await expect(call('status')).rejects.toThrow(/permission denied/i)
    await expect(db.query('select * from public.r2_gateway_objects')).rejects.toThrow(/permission denied/i)
    await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${userA}',false);`)
    await expect(call('reserve', userA, path, 8, lease)).rejects.toThrow(/permission denied/i)
    await expect(db.query('update public.r2_gateway_budget set max_bytes=8000000000')).rejects.toThrow(/permission denied/i)
    await db.exec('reset role; set role service_role;')
    await expect(call('reserve', userB, path, 8, lease)).rejects.toThrow(/r2_not_owned/)
    await call('reserve', userA, path, 8, lease)
    await expect(call('reserve', userA, otherPath, 4, nextLease)).rejects.toThrow(/r2_storage_limit/)
    await expect(call('delete', userA, path, null, nextLease)).rejects.toThrow(/r2_operation_in_progress/)
    await expect(call('attach', userA, path, null, nextLease, 'upload-one')).rejects.toThrow(/r2_lease_mismatch/)
    await call('attach', userA, path, null, lease, 'upload-one')
    await call('delete', userA, path, null, nextLease)
    expect(Number((await call('status')).rows[0].result.reserved_bytes)).toBe(8)
    await expect(call('reserve', userA, otherPath, 4, lease)).rejects.toThrow(/r2_storage_limit/)
    await expect(call('finish_delete', userA, path, null, lease)).rejects.toThrow(/r2_lease_mismatch/)
    await call('finish_delete', userA, path, null, nextLease)
    expect(Number((await call('status')).rows[0].result.reserved_bytes)).toBe(0)
    await expect(call('reserve', userA, path, 8, lease)).rejects.toThrow(/r2_path_already_reserved/)
    await call('reserve', userA, otherPath, 4, lease)
  })

  it('authorizes R2 reads only for the owner or an active publication and accounts operations before access', async () => {
    for (const file of migrations) await db.exec(await readFile(migrationPath(file), 'utf8'))
    const model = '00000000-0000-4000-8000-000000000211'
    const path = `${userA}/showcases/${model}/00000000-0000-4000-8000-000000000212/0.glb`
    const lease = '00000000-0000-4000-8000-000000000213'
    const call = (action: string, owner: string | null = userA, bytes: number | null = null, token: string | null = null, uploadId: string | null = null) => db.query<{ result: { writes: number; reads: number; state: string } }>(
      'select public.r2_gateway($1,$2::uuid,$3,$4,$5::bigint,$6,$7::uuid,$8) as result',
      [action, owner, 'vitrine360-public', path, bytes, 'model/gltf-binary', token, uploadId],
    )
    await db.exec(`insert into auth.users(id) values('${userA}'); update public.r2_gateway_budget set max_reads=1,max_writes=2; set role service_role;`)
    await call('reserve', userA, 1024, lease)
    await expect(call('read', userA)).rejects.toThrow(/r2_object_not_ready/)
    await call('attach', userA, null, lease, 'upload-model')
    await call('complete', userA, null, lease)
    await expect(call('finish_complete', userA, 1025, lease)).rejects.toThrow(/r2_size_mismatch/)
    await call('finish_complete', userA, 1024, lease)
    await expect(call('read', userB)).rejects.toThrow(/r2_not_owned/)
    await expect(call('read', null)).rejects.toThrow(/r2_not_owned/)
    await db.exec(`reset role;
      insert into public.models_3d(id,owner_id,title,model_status) values('${model}','${userA}','Modelo R2','published');
      insert into public.showcase_publications(owner_id,kind,model_id,slug,title,asset_paths,publication_status)
      values('${userA}','model_3d','${model}','r2-model-test','Modelo R2',array['r2:${path}'],'published');
      set role service_role;`)
    expect((await call('read', null)).rows[0].result.state).toBe('ready')
    await expect(call('read', null)).rejects.toThrow(/r2_read_limit/)
    const status = (await call('status')).rows[0].result
    expect(Number(status.writes)).toBe(2)
    expect(Number(status.reads)).toBe(1)
    await db.exec("reset role; update public.showcase_publications set publication_status='disabled'; set role service_role;")
    await expect(call('read', null)).rejects.toThrow(/r2_not_owned/)
  })

  it('stores video carriers independently of projection without changing owner/public privacy', async () => {
    for (const file of migrations) await db.exec(await readFile(migrationPath(file), 'utf8'))
    await db.exec(`
      insert into auth.users(id) values ('${userA}'),('${userB}');
      insert into public.projects(id,owner_id,title) values ('00000000-0000-4000-8000-000000000121','${userA}','Vídeo privado');
      set role authenticated; select set_config('request.jwt.claim.sub','${userA}',false);
      insert into public.scenes(id,project_id,position,title,media_path,width,height,projection,media_kind) values
        ('00000000-0000-4000-8000-000000000122','00000000-0000-4000-8000-000000000121',0,'360','${userA}/scene/video',1920,960,'equirectangular','video'),
        ('00000000-0000-4000-8000-000000000123','00000000-0000-4000-8000-000000000121',1,'Plano','${userA}/scene/flat',1920,1080,'flat','video');
    `)
    await expect(db.exec(`update public.scenes set media_kind='unknown'`)).rejects.toThrow(/scenes_media_kind_valid/)
    await db.exec(`select set_config('request.jwt.claim.sub','${userB}',false);`)
    expect((await db.query('select id from public.scenes')).rows).toHaveLength(0)
    await db.exec('reset role; set role anon;')
    await expect(db.query('select id from public.scenes')).rejects.toThrow(/permission denied/i)
    const read = () => db.query<{ tour: { scenes: { media_kind: string; projection: string; media_path?: string }[] } | null }>(
      'select public.load_public_tour($1) as tour', ['00000000-0000-4000-8000-000000000121'])
    expect((await read()).rows[0].tour).toBeNull()
    await db.exec(`reset role;
      update public.projects set status='published';
      update public.scenes set public_media_path=media_path || '/published';
      insert into public.publications(owner_id,project_id,slug,visibility,publication_status)
        select owner_id,id,id::text,'unlisted','published' from public.projects;
      set role anon;`)
    const publicScenes = (await read()).rows[0].tour!.scenes
    expect(publicScenes.map(scene => ({ media_kind: scene.media_kind, projection: scene.projection }))).toEqual([
      { media_kind: 'video', projection: 'equirectangular' }, { media_kind: 'video', projection: 'flat' },
    ])
    for (const scene of publicScenes) expect(scene).not.toHaveProperty('media_path')
    await expect(db.query('select media_kind from public.scenes')).rejects.toThrow(/permission denied/i)
    await db.exec('reset role;')
    const buckets = (await db.query<{ allowed_mime_types: string[]; file_size_limit: number }>("select allowed_mime_types,file_size_limit from storage.buckets where id in ('vitrine360-private','vitrine360-public')")).rows
    for (const bucket of buckets) { expect(bucket.allowed_mime_types).toContain('video/webm'); expect(Number(bucket.file_size_limit)).toBeGreaterThanOrEqual(524288000) }
  })

  it('restricts scene connections to their tour and clears links when a target is removed', async () => {
    for (const file of migrations) await db.exec(await readFile(migrationPath(file), 'utf8'))
    await db.exec(`
      insert into auth.users (id) values ('${userA}'), ('${userB}');
      insert into public.projects (id, owner_id, title) values
        ('00000000-0000-4000-8000-000000000101', '${userA}', 'Tour A'),
        ('00000000-0000-4000-8000-000000000102', '${userA}', 'Outro tour'),
        ('00000000-0000-4000-8000-000000000103', '${userB}', 'Tour B');
      insert into public.scenes (id, project_id, position, title, media_path, width, height, projection) values
        ('00000000-0000-4000-8000-000000000111','00000000-0000-4000-8000-000000000101',0,'Sala','${userA}/fixture/living',4096,2048,'equirectangular'),
        ('00000000-0000-4000-8000-000000000112','00000000-0000-4000-8000-000000000101',1,'Cozinha','${userA}/fixture/kitchen',4096,2048,'equirectangular'),
        ('00000000-0000-4000-8000-000000000113','00000000-0000-4000-8000-000000000102',0,'Outro','${userA}/fixture/other',4096,2048,'equirectangular'),
        ('00000000-0000-4000-8000-000000000114','00000000-0000-4000-8000-000000000103',0,'Privado','${userB}/fixture/private',4096,2048,'equirectangular');
      set role authenticated; select set_config('request.jwt.claim.sub','${userA}',false);
      insert into public.hotspots (scene_id,target_scene_id,yaw,pitch,title) values
        ('00000000-0000-4000-8000-000000000111','00000000-0000-4000-8000-000000000112',0,0,'Ir para cozinha');
    `)
    for (const target of ['00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-000000000114']) {
      await expect(db.exec(`update public.hotspots set target_scene_id='${target}'`)).rejects.toThrow(/mesmo tour/)
    }
    await expect(db.exec(`update public.scenes set project_id='00000000-0000-4000-8000-000000000102' where id='00000000-0000-4000-8000-000000000112'`)).rejects.toThrow(/conexões/)
    await db.exec(`delete from public.scenes where id='00000000-0000-4000-8000-000000000112'`)
    expect((await db.query<{ target_scene_id: string | null }>('select target_scene_id from public.hotspots')).rows).toEqual([{ target_scene_id: null }])
  })

  it('applies all migrations repeatedly and isolates private projects between accounts', async () => {
    for (const file of migrations) await db.exec(await readFile(migrationPath(file), 'utf8'))
    for (const file of migrations) await db.exec(await readFile(migrationPath(file), 'utf8'))

    await db.exec(`
      insert into auth.users (id) values ('${userA}'), ('${userB}');
      insert into public.floorplans (id, owner_id, title) values
        ('00000000-0000-4000-8000-000000000061', '${userA}', 'Planta A'),
        ('00000000-0000-4000-8000-000000000062', '${userB}', 'Planta B');
      update public.profiles set display_name = 'Perfil de Ana', bio = 'Fotógrafa 360°', public_slug = 'ana-360', is_public = true where id = '${userA}';
      update public.profiles set display_name = 'Perfil privado', public_slug = 'privado-360', is_public = false where id = '${userB}';
      insert into public.projects (owner_id, title, status) values
        ('${userA}', 'Tour privado A', 'draft'),
        ('${userB}', 'Tour privado B', 'draft'),
        ('${userB}', 'Tour público B', 'published');
      insert into public.scenes (id, project_id, position, title, media_path, public_media_path, width, height, projection)
      select '00000000-0000-4000-8000-000000000041', id, 0, 'Cena pública', '${userB}/tour/scene/original', '${userB}/tour/scene/published', 4096, 2048, 'equirectangular'
      from public.projects where title = 'Tour público B';
      insert into public.publications (owner_id, project_id, slug, visibility, publication_status, published_at)
      select owner_id, id, id::text, 'unlisted', 'published', now() from public.projects where title = 'Tour público B';
      insert into public.hotspots (scene_id, yaw, pitch, title, image_url, embed_url) values
        ('00000000-0000-4000-8000-000000000041', 0.2, 0.1, 'Vídeo da sala', 'https://cdn.example.com/sala.jpg', 'https://www.youtube.com/watch?v=abcDEF_1234');
      insert into storage.objects (bucket_id, name) values ('vitrine360-private', '${userA}/project/scene/original');
    `)
    await expect(db.query(`insert into public.hotspots (scene_id, yaw, pitch, embed_url) values ('00000000-0000-4000-8000-000000000041', 0, 0, 'https://evil.example/embed/1')`)).rejects.toThrow(/hotspots_embed_url_valid/i)
    const publicProjectId = (await db.query<{ id: string }>("select id from public.projects where title = 'Tour público B'")).rows[0].id

    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userA}', false);`)
    const ownRows = await db.query<{ title: string }>('select title from public.projects order by title')
    expect(ownRows.rows.map(row => row.title)).toEqual(['Tour privado A'])
    const updateOther = await db.query(`update public.projects set title = 'Alterado' where owner_id = '${userB}' returning id`)
    expect(updateOther.rows).toHaveLength(0)
    const plans = await db.query<{ title: string }>('select title from public.floorplans')
    expect(plans.rows).toEqual([{ title: 'Planta A' }])
    const editOtherPlan = await db.query(`update public.floorplans set title = 'Alterada' where owner_id = '${userB}' returning id`)
    expect(editOtherPlan.rows).toHaveLength(0)

    await db.exec('reset role; set role anon; reset request.jwt.claim.sub;')
    await expect(db.query('select title from public.projects order by title')).rejects.toThrow(/permission denied/i)
    await expect(db.query('select * from public.floorplans')).rejects.toThrow(/permission denied/i)
    await expect(db.query('select image_url, embed_url from public.hotspots')).rejects.toThrow(/permission denied/i)
    const publicTour = (await db.query<{ tour: { title: string; scenes: Record<string, unknown>[]; hotspots: { image_url: string; embed_url: string }[] } }>(
      'select public.load_public_tour($1) as tour', [publicProjectId])).rows[0].tour
    expect(publicTour.title).toBe('Tour público B')
    expect(publicTour.hotspots[0]).toMatchObject({ image_url: 'https://cdn.example.com/sala.jpg', embed_url: 'https://www.youtube.com/watch?v=abcDEF_1234' })
    expect(publicTour).not.toHaveProperty('draft_manifest')
    for (const scene of publicTour.scenes) expect(scene).not.toHaveProperty('media_path')
    const tracked = await db.query<{ recorded: boolean }>(`select public.record_tour_event($1, '00000000-0000-4000-8000-000000000051', 'view') as recorded`, [publicProjectId])
    expect(tracked.rows[0].recorded).toBe(true)
    const duplicate = await db.query<{ recorded: boolean }>(`select public.record_tour_event($1, '00000000-0000-4000-8000-000000000051', 'view') as recorded`, [publicProjectId])
    expect(duplicate.rows[0].recorded).toBe(false)
    const invalidScene = await db.query<{ recorded: boolean }>(`select public.record_tour_event($1, '00000000-0000-4000-8000-000000000052', 'scene_change', '${userA}') as recorded`, [publicProjectId])
    expect(invalidScene.rows[0].recorded).toBe(false)
    await db.query(`select public.record_tour_event($1, '00000000-0000-4000-8000-000000000054', 'scene_change', '00000000-0000-4000-8000-000000000041')`, [publicProjectId])
    await expect(db.query('select * from public.analytics_events')).rejects.toThrow(/permission denied/i)
    await expect(db.query('select public.load_tour_analytics(30)')).rejects.toThrow(/permission denied/i)
    const publicProfile = await db.query("select public.load_public_profile('ana-360') as profile")
    expect(publicProfile.rows[0].profile).toEqual({ slug: 'ana-360', display_name: 'Perfil de Ana', bio: 'Fotógrafa 360°', website_url: null })
    const privateProfile = await db.query("select public.load_public_profile('privado-360') as profile")
    expect(privateProfile.rows[0].profile).toBeNull()
    await expect(db.query('select * from public.profiles')).rejects.toThrow(/permission denied/i)
    const deniedPrivateMedia = await db.query<{ count: number }>("select count(*)::int as count from storage.objects where bucket_id = 'vitrine360-private'")
    expect(deniedPrivateMedia.rows[0].count).toBe(0)
    await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${userB}', false);`)
    const ownerAnalytics = await db.query<{ report: { total_views: number; period_views: number; published_tours: number; daily: unknown[] } }>('select public.load_tour_analytics(30) as report')
    expect(ownerAnalytics.rows[0].report).toMatchObject({ total_views: 1, period_views: 1, published_tours: 1 })
    expect(ownerAnalytics.rows[0].report.daily).toHaveLength(30)
    const interactions = await db.query<{ result: { scene_entries: number; hotspot_clicks: number } }>('select public.load_tour_interactions(30) as result')
    expect(interactions.rows[0].result).toEqual({ scene_entries: 1, hotspot_clicks: 0 })
    await db.exec(`select set_config('request.jwt.claim.sub', '${userA}', false);`)
    const otherAnalytics = await db.query<{ report: { total_views: number } }>('select public.load_tour_analytics(30) as report')
    expect(otherAnalytics.rows[0].report.total_views).toBe(0)
    const otherInteractions = await db.query<{ result: { scene_entries: number; hotspot_clicks: number } }>('select public.load_tour_interactions(30) as result')
    expect(otherInteractions.rows[0].result).toEqual({ scene_entries: 0, hotspot_clicks: 0 })
    await db.exec(`select set_config('request.jwt.claim.sub', '${userB}', false); update public.projects set status = 'draft' where title = 'Tour público B';`)
    const disabled = await db.query<{ recorded: boolean }>(`select public.record_tour_event((select id from public.projects where title = 'Tour público B'), '00000000-0000-4000-8000-000000000053', 'view') as recorded`)
    expect(disabled.rows[0].recorded).toBe(false)
    await db.exec(`reset role;
      insert into public.models_3d (owner_id, project_id, title)
        select owner_id, id, 'Objeto preservado' from public.projects where title = 'Tour público B';
      insert into public.reconstruction_jobs (owner_id, project_id, job_kind, provider)
        select owner_id, id, 'object_generation', 'tripo' from public.projects where title = 'Tour público B';
      delete from public.projects where title = 'Tour público B';
    `)
    const preservedModel = await db.query<{ owner_id: string; project_id: string | null }>("select owner_id, project_id from public.models_3d where title = 'Objeto preservado'")
    expect(preservedModel.rows).toEqual([{ owner_id: userB, project_id: null }])
    const preservedJob = await db.query<{ owner_id: string; project_id: string | null }>('select owner_id, project_id from public.reconstruction_jobs')
    expect(preservedJob.rows).toEqual([{ owner_id: userB, project_id: null }])
  })

  it('publishes independent side/top views atomically and rejects invalid or unowned manifests', async () => {
    for (const file of migrations) await db.exec(await readFile(migrationPath(file), 'utf8'))
    await db.exec(`insert into auth.users (id) values ('${userA}'), ('${userB}'); set role authenticated; select set_config('request.jwt.claim.sub', '${userA}', false);`)
    const spinId = '00000000-0000-4000-8000-000000000081'
    let revision = '00000000-0000-4000-8000-000000000082'
    let owner = userA
    const publish = (topCount: number, count = 192, legacy = false) => db.query(`select public.${legacy ? 'publish_showcase' : 'publish_showcase_views'}(
      'product_spin', '${spinId}', 'carro-duas-vistas', 'Carro', 'Teto e lateral', null, '#10201c',
      array(select gen_random_uuid() from generate_series(0,${count - 1})),
      array(select '${owner}/showcases/${spinId}/${revision}/' || i || '.jpg' from generate_series(0,${count - 1}) i),
      array(select 'frame-' || i || '.jpg' from generate_series(0,${count - 1}) i),
      array(select 'image/jpeg'::text from generate_series(0,${count - 1})),
      array(select 100::bigint from generate_series(0,${count - 1})), 'vehicle', 1, 350${legacy ? '' : `, ${topCount}`}) as result`)
    await publish(96)
    await db.exec('set role anon;')
    const read = () => db.query<{ manifest: { assets: string[]; top_assets?: string[] } }>("select public.load_public_showcase('carro-duas-vistas') as manifest")
    const { manifest } = (await read()).rows[0]
    expect(manifest.assets).toHaveLength(96)
    expect(manifest.top_assets).toHaveLength(96)
    expect(manifest.assets[95]).toContain('/95.jpg')
    expect(manifest.top_assets?.[0]).toContain('/96.jpg')
    await expect(db.query('select top_frame_count from public.showcase_publications')).rejects.toThrow(/permission denied/i)
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userA}', false);`)
    for (const invalid of [1, -1, 121, 192]) await expect(publish(invalid)).rejects.toThrow(/invalid_asset_count/)
    expect((await read()).rows[0].manifest.assets).toHaveLength(96)
    await db.exec(`select set_config('request.jwt.claim.sub', '${userB}', false);`)
    owner = userB
    await expect(publish(96)).rejects.toThrow(/item_not_owned|row-level security/i)
    await db.exec(`select set_config('request.jwt.claim.sub', '${userA}', false);`)
    owner = userA
    revision = '00000000-0000-4000-8000-000000000083'
    await publish(0, 2, true)
    const single = (await read()).rows[0].manifest
    expect(single.assets).toHaveLength(2)
    expect(single.top_assets).toBeUndefined()
    await db.query(`select public.unpublish_showcase('product_spin', '${spinId}')`)
    expect((await read()).rows[0].manifest).toBeNull()
  })

  it('serves only published showcase manifests without exposing the publication table', async () => {
    for (const file of migrations) await db.exec(await readFile(migrationPath(file), 'utf8'))
    await db.exec(`
      insert into auth.users (id) values ('${userA}'), ('${userB}');
      insert into public.models_3d (id, owner_id, title, model_status) values
        ('00000000-0000-4000-8000-000000000011', '${userA}', 'Modelo público', 'published'),
        ('00000000-0000-4000-8000-000000000012', '${userB}', 'Modelo privado', 'draft');
      insert into public.showcase_publications (owner_id, kind, model_id, slug, title, description, asset_paths, publication_status) values
        ('${userA}', 'model_3d', '00000000-0000-4000-8000-000000000011', 'modelo-publico-0011', 'Modelo público', 'Descrição pública', array['${userA}/showcases/a/model.glb'], 'published'),
        ('${userB}', 'model_3d', '00000000-0000-4000-8000-000000000012', 'modelo-privado-0012', 'Modelo privado', 'Não publicar', array['${userB}/showcases/b/model.glb'], 'disabled');
    `)
    await db.exec('set role anon;')
    const published = await db.query<{ manifest: { kind: string; title: string; description: string; assets: string[] } }>("select public.load_public_showcase('modelo-publico-0011') as manifest")
    expect(published.rows[0].manifest).toEqual({
      kind: 'model_3d', slug: 'modelo-publico-0011', title: 'Modelo público', description: 'Descrição pública',
      price_label: null, background: '#f4f6f2', zoom: 1, assets: [`${userA}/showcases/a/model.glb`],
    })
    const privateLink = await db.query("select public.load_public_showcase('modelo-privado-0012') as manifest")
    expect(privateLink.rows[0].manifest).toBeNull()
    await expect(db.query('select * from public.showcase_publications')).rejects.toThrow(/permission denied/i)
  })

  it('publishes and unpublishes a model through owner-scoped SQL procedures', async () => {
    for (const file of migrations) await db.exec(await readFile(migrationPath(file), 'utf8'))
    await db.exec(`insert into auth.users (id) values ('${userA}');`)
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userA}', false);`)
    const modelId = '00000000-0000-4000-8000-000000000021'
    const assetId = '00000000-0000-4000-8000-000000000022'
    const revision = '00000000-0000-4000-8000-000000000023'
    const path = `${userA}/showcases/${modelId}/${revision}/0.glb`
    const published = await db.query<{ result: { slug: string } }>(`select public.publish_showcase(
      'model_3d', '${modelId}', 'modelo-3d-0021', 'Modelo 3D', 'Descrição do objeto', 'R$ 250', '#f4f6f2',
      array['${assetId}'::uuid], array['${path}'], array['objeto.glb'], array['model/gltf-binary'], array[1024::bigint], null, 1, 100
    ) as result`)
    expect(published.rows[0].result.slug).toBe('modelo-3d-0021')
    const publicRead = await db.query("select public.load_public_showcase('modelo-3d-0021') as manifest")
    expect(publicRead.rows[0].manifest).not.toBeNull()
    await db.query("select public.unpublish_showcase('model_3d', '00000000-0000-4000-8000-000000000021')")
    const hidden = await db.query("select public.load_public_showcase('modelo-3d-0021') as manifest")
    expect(hidden.rows[0].manifest).toBeNull()

    const spinId = '00000000-0000-4000-8000-000000000031'
    const frameA = '00000000-0000-4000-8000-000000000032'
    const frameB = '00000000-0000-4000-8000-000000000033'
    const spinRevision = '00000000-0000-4000-8000-000000000034'
    const spinAssets = [`${userA}/showcases/${spinId}/${spinRevision}/0.jpg`, `${userA}/showcases/${spinId}/${spinRevision}/1.jpg`]
    await db.query(`select public.publish_showcase(
      'product_spin', '${spinId}', 'giro-produto-0031', 'Giro de produto', '', null, '#f4f6f2',
      array['${frameA}'::uuid, '${frameB}'::uuid], array['${spinAssets[0]}', '${spinAssets[1]}'],
      array['frente.jpg', 'lado.jpg'], array['image/jpeg', 'image/jpeg'], array[100::bigint, 100::bigint], 'product', 1.4, 350
    )`)
    const spinManifest = await db.query<{ manifest: { kind: string; assets: string[]; zoom: number } }>("select public.load_public_showcase('giro-produto-0031') as manifest")
    expect(spinManifest.rows[0].manifest).toMatchObject({ kind: 'product_spin', assets: spinAssets, zoom: 1.4 })
    const frames = await db.query<{ count: number }>(`select count(*)::int as count from public.product_spin_frames where spin_id = '${spinId}'`)
    expect(frames.rows[0].count).toBe(2)
    await db.query(`select public.unpublish_showcase('product_spin', '${spinId}')`)
    const removedFrames = await db.query<{ count: number }>(`select count(*)::int as count from public.product_spin_frames where spin_id = '${spinId}'`)
    expect(removedFrames.rows[0].count).toBe(0)
    const unpublishedSpin = await db.query("select public.load_public_showcase('giro-produto-0031') as manifest")
    expect(unpublishedSpin.rows[0].manifest).toBeNull()
  })
})
