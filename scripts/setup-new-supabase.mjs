import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { newProjectDatabase, newProjectRef } from './new-project-database.mjs'

const project = newProjectRef
const apply = process.argv.includes('--apply')
const client = await newProjectDatabase('vitrine360-new-project-setup')

try {
  await client.connect()
  if (!client.connection.stream.authorized) throw new Error('tls_not_verified')
  const directory = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
  const names = (await readdir(directory)).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort()
  if (names.length !== 19 || names.at(-1) !== '0019_atomic_tour_publication.sql') throw new Error('unexpected_migration_inventory')
  const migrations = await Promise.all(names.map(async name => {
    const sql = await readFile(`${directory}/${name}`, 'utf8')
    return { name, sql, digest: createHash('sha256').update(sql).digest('hex') }
  }))
  const tables = (await client.query("select tablename from pg_catalog.pg_tables where schemaname='public' order by tablename")).rows.map(row => row.tablename)
  const hasHistory = (await client.query("select to_regclass('vitrine360_setup.migrations') is not null as present")).rows[0].present
  const history = hasHistory ? (await client.query('select name,digest from vitrine360_setup.migrations order by name')).rows : []
  console.log(JSON.stringify({ event: 'preflight', project, tlsVerified: true, existingPublicTables: tables, previouslyRecordedMigrations: history.length, mode: apply ? 'apply' : 'inspect' }))
  if (history.length > migrations.length || history.some((row,index) => row.name !== migrations[index].name || row.digest !== migrations[index].digest)) throw new Error('migration_history_mismatch')
  const pending = migrations.slice(history.length)
  console.log(JSON.stringify({ event: 'migration_plan', project, pending: pending.map(item => item.name), schemaBackup: 'server-private', preservesExistingData: true }))
  if (!pending.length) {
    console.log(JSON.stringify({ event: 'already_applied', project }))
  } else if (apply) {
    // Do not alter unknown pre-existing application tables, even on this host.
    if (!history.length && tables.length) throw new Error('untracked_existing_tables_require_review')
    await client.query('BEGIN')
    try {
      await client.query("select pg_advisory_xact_lock(hashtext('vitrine360:new-project-setup'))")
      if (!hasHistory) await client.query('create schema vitrine360_setup; revoke all on schema vitrine360_setup from public,anon,authenticated; create table vitrine360_setup.migrations(name text primary key,digest text not null,applied_at timestamptz not null default now()); revoke all on vitrine360_setup.migrations from public,anon,authenticated')
      const lockedHistory = (await client.query('select name,digest from vitrine360_setup.migrations order by name')).rows
      if (JSON.stringify(lockedHistory) !== JSON.stringify(history)) throw new Error('migration_history_changed')
      await client.query('create table if not exists vitrine360_setup.migration_backups(name text primary key,schema_evidence jsonb not null,created_at timestamptz not null default now()); revoke all on vitrine360_setup.migration_backups from public,anon,authenticated')
      for (const migration of pending) {
        // Server-private, transactional schema backup before additive changes.
        await client.query(`insert into vitrine360_setup.migration_backups(name,schema_evidence)
          select $1,jsonb_build_object('constraints',coalesce((select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid))) from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public'),'[]'::jsonb),
            'functions',coalesce((select jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),'[]'::jsonb)) on conflict(name) do nothing`,[migration.name])
        await client.query(migration.sql)
        await client.query('insert into vitrine360_setup.migrations(name,digest) values($1,$2)', [migration.name,migration.digest])
      }
      await client.query('COMMIT')
      await client.query("NOTIFY pgrst, 'reload schema'")
      console.log(JSON.stringify({ event: 'committed', project, migrationCount: pending.length, totalMigrations: migrations.length }))
    } catch (error) { await client.query('ROLLBACK'); throw error }
  }
  if (apply) {
    const permissions = (await client.query("select c.relname as table_name,c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname")).rows
    const gateway = (await client.query("select has_function_privilege('anon','public.r2_gateway(text,uuid,text,text,bigint,text,uuid,text)','execute') as anonymous_gateway_access,has_function_privilege('authenticated','public.r2_gateway(text,uuid,text,text,bigint,text,uuid,text)','execute') as client_gateway_access")).rows[0]
    console.log(JSON.stringify({ event: 'verification', project, tables: permissions, ...gateway }))
  }
} catch (error) {
  // Provider errors can contain transport metadata; return safe codes only.
  console.error(JSON.stringify({ event: 'setup_failed', code: typeof error.code === 'string' ? error.code : 'setup_error' }))
  process.exitCode = 1
} finally { await client.end() }
