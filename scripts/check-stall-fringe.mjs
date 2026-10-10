import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { edgeNearWhiteCount } from './stall-fringe.mjs'

const dir = join(dirname(fileURLToPath(import.meta.url)), '../public/assets/art25/stalls')
const limit = 24
let failed = false
for (const name of readdirSync(dir).filter((file) => file.endsWith('.png')).sort()) {
  const count = edgeNearWhiteCount(join(dir, name))
  const ok = count <= limit
  if (!ok) failed = true
  console.log(`${ok ? 'ok' : 'fringe'} ${name} edge-near-white=${count} limit=${limit}`)
}
if (failed) process.exit(1)
