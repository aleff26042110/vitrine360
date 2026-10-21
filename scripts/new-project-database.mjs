import { readFile } from 'node:fs/promises'
import { Client } from 'pg'

// The old project is deliberately not selectable by arguments or environment.
export const newProjectRef = 'msovfbuhehaiousuzbwr'
export async function newProjectDatabase(applicationName) {
  const host = `db.${newProjectRef}.supabase.co`
  return new Client({ host, port: 5432, user: 'postgres', database: 'postgres',
    ssl: { rejectUnauthorized: true, servername: host, ca: await readFile(new URL('../.tmp-ui/supabase-root-ca.local.pem',import.meta.url),'utf8') },
    enableChannelBinding: true, application_name: applicationName, connectionTimeoutMillis: 60000, statement_timeout: 30000,
    password: async () => {
      if (process.stdin.isTTY) process.stdin.setRawMode(true)
      console.log(JSON.stringify({ event: 'password_required', project: newProjectRef, transport: 'stdin-only' }))
      let value = ''
      for await (const chunk of process.stdin) {
        value += chunk.toString('utf8')
        if (value.length > 1024) throw new Error('credential_input_too_large')
        const end = value.search(/[\r\n]/)
        if (end >= 0) return value.slice(0,end)
      }
      throw new Error('credential_input_missing')
    },
  })
}
