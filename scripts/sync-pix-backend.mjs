import { readFile, mkdir, writeFile } from 'node:fs/promises'
const destination = new URL('../supabase/functions/_shared/', import.meta.url)
await mkdir(destination, { recursive: true })
await writeFile(new URL('pix.mjs', destination), await readFile(new URL('../cloudflare/pix.mjs', import.meta.url)))
console.log('Pix adapter synchronized for Supabase Edge deployment.')
