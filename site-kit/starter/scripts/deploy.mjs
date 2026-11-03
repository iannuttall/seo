// Deploys the built site, then tells search engines which pages changed.
// It compares the page hashes in dist/indexnow.json with the copy on the
// live site and sends only added, updated and removed URLs to IndexNow.
// Set this as the Cloudflare Workers Builds deploy command: pnpm run deploy
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import {
  changedUrls,
  diffManifests,
  parseManifest,
  submitToIndexNow,
} from '@iannuttall/seo-graph-core'
import config from '../site.config.json' with { type: 'json' }

const origin = `https://${config.domain}`
const current = parseManifest(await readFile('dist/indexnow.json', 'utf8'))
if (!current) throw new Error('dist/indexnow.json is missing. Run the build.')

let previous = null
try {
  const response = await fetch(`${origin}/indexnow.json`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (response.ok) previous = parseManifest(await response.text())
} catch {
  // The first deploy has no live copy.
}

execFileSync('npx', ['wrangler', 'deploy'], { stdio: 'inherit' })

// Only tell search engines once the domain serves this site, which the
// key file proves. Before launch the site lives on workers.dev.
let live = false
try {
  const response = await fetch(`${origin}/${config.indexNowKey}.txt`, {
    signal: AbortSignal.timeout(10_000),
  })
  live = response.ok && (await response.text()).trim() === config.indexNowKey
} catch {
  live = false
}
if (!config.indexNowKey || !live) {
  console.log(`IndexNow skipped: ${origin} does not serve this site yet.`)
} else {
  const urls = changedUrls(diffManifests(previous ?? {}, current))
  if (!urls.length) {
    console.log('IndexNow: no pages changed.')
  } else {
    const results = await submitToIndexNow({
      host: config.domain,
      key: config.indexNowKey,
      urls,
    })
    for (const result of results) {
      console.log(
        `IndexNow: ${result.submitted} URLs, status ${result.status}${result.ok ? '' : ` (${result.message})`}`,
      )
    }
  }
}
