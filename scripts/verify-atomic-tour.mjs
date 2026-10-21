import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { newProjectDatabase, newProjectRef } from './new-project-database.mjs'

// Real PostgreSQL/auth roles/functions, temporary metadata inside one transaction.
// No R2 operations or real files, no persisted fixture, no existing project edits.
const client = await newProjectDatabase('vitrine360-atomic-tour-rollback-verification')
let open = false
try {
  await client.connect()
  if (!client.connection.stream.authorized) throw new Error('tls_not_verified')
  const owner = (await client.query('select user_id from public.site_administrators order by created_at limit 1')).rows[0]?.user_id
  if (!owner) throw new Error('test_owner_not_available')
  const project = randomUUID(), scene = randomUUID(), first = randomUUID(), second = randomUUID()
  const payload = revision => [{ id: scene, title: 'Temporary rollback fixture', media_path: `${owner}/${project}/${scene}/${revision}/original`, public_media_path: `${owner}/${project}/${scene}/${revision}/published`,
    width: 100, height: 50, projection: 'flat', media_kind: 'image', approximate: false, north_offset: 0, byte_size: 100, mime_type: 'image/jpeg' }]
  await client.query('begin'); open = true
  for (const revision of [first,second]) for (const media of payload(revision)) await client.query('insert into storage.objects(bucket_id,name) values($1,$2),($3,$4)', ['vitrine360-private',media.media_path,'vitrine360-public',media.public_media_path])
  await client.query('set local role authenticated')
  await client.query("select set_config('request.jwt.claim.sub',$1,true)",[owner])
  const commit = (revision,base,values=payload(revision),hotspots=[]) => client.query("select public.commit_tour_revision($1,$2,$3,'Atomic verification',true,$4,$5::jsonb,$6::jsonb) as result",[project,revision,base,scene,JSON.stringify(values),JSON.stringify(hotspots)])
  await commit(first,null)
  await commit(first,null)
  const read = async () => (await client.query('select public.load_public_tour($1) as result',[project])).rows[0].result
  const before = await read()
  assert.equal(before.scenes[0].public_media_path,payload(first)[0].public_media_path)
  await client.query('savepoint expected_failure')
  try {
    await commit(second,first,payload(second),[{ id: randomUUID(),scene_id: scene,yaw: 0,pitch: 0,title: 'Invalid embed',spot_kind: 'info',icon_style: 'dot',icon_scale: 1,embed_url: 'https://invalid.example/player' }])
    throw new Error('constraint_failure_not_reproduced')
  } catch (error) { if (error.code !== '23514') throw error }
  await client.query('rollback to savepoint expected_failure')
  assert.deepEqual(await read(),before)
  await commit(second,first)
  await client.query('set local role anon')
  assert.equal((await read()).scenes[0].public_media_path,payload(second)[0].public_media_path)
  await client.query('rollback'); open = false
  assert.equal(Number((await client.query('select count(*) from public.projects where id=$1',[project])).rows[0].count),0)
  console.log(JSON.stringify({ event: 'atomic_tour_verified', project: newProjectRef, tlsVerified: true, realPostgres: true, idempotentReceipt: true, failedCutoverPreserved: true, anonymousSnapshot: true, fixtureRolledBack: true }))
} catch (error) {
  if (open) await client.query('rollback').catch(() => undefined)
  console.error(JSON.stringify({ event: 'atomic_tour_verification_failed', code: typeof error.code === 'string' ? error.code : 'verification_error' }))
  process.exitCode=1
} finally { await client.end() }
