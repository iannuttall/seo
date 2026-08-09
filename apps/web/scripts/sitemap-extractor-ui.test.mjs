import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('sitemap extractor uses the full bounded limit and keeps actions above long results', () => {
  const source = readFileSync(
    resolve(appRoot, 'src/components/tools/SitemapExtractor.astro'),
    'utf8',
  )

  assert.doesNotMatch(source, /data-maximum-urls|Maximum URLs/)
  assert.match(source, /const maximumUrls = 50_000/)
  assert.ok(
    source.indexOf('data-copy') < source.indexOf('data-warning-section'),
    'Copy action should appear before sitemap warnings and tables.',
  )
  assert.ok(
    source.indexOf('data-export="csv"') <
      source.indexOf('data-warning-section'),
    'Download actions should appear before sitemap warnings and tables.',
  )
  assert.match(
    source,
    /<DottedCard patternId="sitemap-extractor-results" inverted>[\s\S]+?<\/DottedCard>\s+<DottedCard patternId="sitemap-extractor-details">[\s\S]+?<\/DottedCard>\s+<DottedCard patternId="sitemap-extractor-url-list">/,
  )
  assert.ok(
    source.indexOf('sitemap-extractor-details') <
      source.indexOf('data-warning-section'),
    'Warnings and sitemap files should use a normal details card.',
  )
  assert.ok(
    source.indexOf('sitemap-extractor-url-list') <
      source.indexOf('data-search'),
    'Filters and URL tables should use their own normal result card.',
  )
  assert.doesNotMatch(source, /copyLimit|slice\(0,\s*10_000\)/)
})
