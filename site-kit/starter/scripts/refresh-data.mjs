// Checks every source in src/data/sources.json for changes. A source that
// answers with the same ETag, Last-Modified date or file hash is unchanged.
// A changed source is saved to data/raw/<id>, its checked date moves to
// today, and the refresh workflow opens a pull request for a person to
// review. Turning the raw file into src/data/*.json is site specific: write
// that step in scripts/build-data.mjs when you add your own data.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const sourcesFile = 'src/data/sources.json'
const sources = JSON.parse(await readFile(sourcesFile, 'utf8'))
const today = new Date().toISOString().slice(0, 10)
let changed = 0

for (const source of sources) {
  const headers = {}
  if (source.etag) headers['If-None-Match'] = source.etag
  if (source.lastModified) headers['If-Modified-Since'] = source.lastModified
  let response
  try {
    response = await fetch(source.url, {
      headers,
      signal: AbortSignal.timeout(60_000),
    })
  } catch (error) {
    console.error(`${source.id}: could not fetch ${source.url}: ${error}`)
    process.exitCode = 1
    continue
  }
  if (response.status === 304) {
    console.log(`${source.id}: unchanged`)
    continue
  }
  if (!response.ok) {
    console.error(`${source.id}: ${source.url} returned ${response.status}`)
    process.exitCode = 1
    continue
  }
  const body = Buffer.from(await response.arrayBuffer())
  const sha256 = createHash('sha256').update(body).digest('hex')
  source.etag = response.headers.get('etag')
  source.lastModified = response.headers.get('last-modified')
  if (sha256 === source.sha256) {
    console.log(`${source.id}: unchanged`)
    continue
  }
  await mkdir('data/raw', { recursive: true })
  await writeFile(`data/raw/${source.id}`, body)
  source.sha256 = sha256
  source.checked = today
  changed += 1
  console.log(`${source.id}: changed, saved to data/raw/${source.id}`)
}

await writeFile(sourcesFile, `${JSON.stringify(sources, null, 2)}\n`)
if (changed && existsSync('scripts/build-data.mjs')) {
  await import('./build-data.mjs')
}
console.log(`${changed} of ${sources.length} sources changed.`)
