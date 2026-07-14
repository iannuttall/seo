import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const dist = resolve(import.meta.dirname, '..', 'dist')

test('built pages include the OG template and static preview hook', () => {
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8')

  assert.match(
    html,
    /<template data-og-template data-og-width="1200" data-og-height="630">/,
  )
  assert.match(html, /Open source SEO audit tool for AI agents/)
  assert.match(html, /The SEO command for AI agents/)
  assert.match(html, /bg-header[^\"]*text-header-foreground/)
  assert.match(html, /data-footer-dither-static/)
  assert.match(html, /og-frame-shadow/)
  assert.match(html, /og-command-shadow/)
  assert.match(html, /absolute bottom-2 right-2 left-0 top-0/)
  assert.match(html, /dataset\.ogPreview/)
  assert.match(html, /__OG_READY__/)
})
