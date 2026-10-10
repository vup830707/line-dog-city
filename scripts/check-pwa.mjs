import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
if (!existsSync(dist)) {
  console.error('PWA check failed: dist/ is missing. Run vite build first.')
  process.exit(1)
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, acc)
    else acc.push(path)
  }
  return acc
}

const files = walk(dist)
const manifest = files.find((file) => /manifest\.(webmanifest|json)$/.test(file))
const worker = files.find((file) => /(^|\/)(sw|service-worker)\.js$/.test(file))

if (!manifest || !worker) {
  console.error('PWA check failed.')
  console.error('manifest:', manifest ?? '(missing)')
  console.error('service worker:', worker ?? '(missing)')
  console.error(files.join('\n'))
  process.exit(1)
}

console.log(`PWA ok: ${manifest}, ${worker}`)
