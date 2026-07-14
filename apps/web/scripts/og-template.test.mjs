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
  assert.match(template, /The only SEO Skill your agent needs/)
  assert.doesNotMatch(template, /One SEO skill gives your agent/)
  assert.match(template, /The SEO command for AI agents/)
  assert.match(template, /leading-\[1\.12\]/)
  assert.match(template, /bg-header[^\"]*text-header-foreground/)
  assert.match(template, /data-footer-dither-static/)
  assert.match(template, /og-frame-shadow/)
  assert.match(template, /og-command-shadow/)
  assert.match(template, /absolute bottom-2 right-2 left-0 top-0/)
  assert.match(html, /dataset\.ogPreview/)
  assert.match(html, /__OG_READY__/)
})
