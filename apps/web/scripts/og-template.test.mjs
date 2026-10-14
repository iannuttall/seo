import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const dist = resolve(import.meta.dirname, '..', 'dist')

test('built pages include the OG template and static preview hook', () => {
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8')
  const template = html.match(
    /<template data-og-template[^>]*>([\s\S]*?)<\/template>/,
  )?.[1]

  assert.ok(template)
  assert.match(template, /Free SEO data for AI agents/)
  assert.match(template, /The SEO command for AI agents/)
  assert.match(template, /npm i -g seo/)
  assert.match(template, /seoskill\.dev\/mcp/)
  assert.match(template, /h-\[630px\] w-\[1200px\]/)
  assert.doesNotMatch(template, /dither|og-frame-shadow/)
  assert.match(html, /dataset\.ogPreview/)
  assert.match(html, /__OG_READY__/)
})
