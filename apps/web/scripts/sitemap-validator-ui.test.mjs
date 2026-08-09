import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('sitemap indexes expose child validation links and URL query loading', () => {
  const source = readFileSync(
    resolve(appRoot, 'src/components/tools/SitemapValidator.astro'),
    'utf8',
  )

  assert.match(source, /data-index-sitemaps/u)
  assert.match(source, /href\.searchParams\.set\('url', child\)/u)
  assert.match(source, /searchParams\.get\('url'\)/u)
  assert.match(source, /urlForm\.requestSubmit\(\)/u)
  assert.match(source, /defaultToolUrlToHttps\(urlInput\.value\)/u)
  assert.match(source, /data-url-error hidden class="[^"]*text-red-700/u)
})
