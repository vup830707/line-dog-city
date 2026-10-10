import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { publicBase } from './public-base.mjs'

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
const manifest = files.find((file) => file.endsWith('manifest.webmanifest'))
const worker = files.find((file) => /(^|\/)(sw|service-worker)\.js$/.test(file))

if (!manifest || !worker) {
  console.error('PWA check failed.')
  console.error('manifest:', manifest ?? '(missing)')
  console.error('service worker:', worker ?? '(missing)')
  console.error(files.join('\n'))
  process.exit(1)
}

const base = publicBase()
const manifestJson = JSON.parse(readFileSync(manifest, 'utf8'))
const workerSource = readFileSync(worker, 'utf8')
const problems = []

if (manifestJson.start_url !== base) problems.push(`start_url ${manifestJson.start_url} !== ${base}`)
if (manifestJson.scope !== base) problems.push(`scope ${manifestJson.scope} !== ${base}`)
for (const icon of manifestJson.icons ?? []) {
  if (!String(icon.src).startsWith(base)) problems.push(`icon ${icon.src} is outside ${base}`)
}
if (!workerSource.includes(`${base}index.html`) || !workerSource.includes(`${base}assets/`)) {
  problems.push(`service worker is missing ${base} asset paths`)
}

if (problems.length > 0) {
  console.error('PWA path check failed.')
  for (const problem of problems) console.error(problem)
  process.exit(1)
}

console.log(`PWA ok: ${manifest}, ${worker} (base ${base})`)
