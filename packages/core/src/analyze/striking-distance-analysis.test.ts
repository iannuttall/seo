import assert from 'node:assert/strict'
import test from 'node:test'
import type { GscRow } from '../types.js'
import { analyzeStrikingDistanceRows } from './striking-distance-analysis.js'

const site = 'sc-domain:acme.test'

function row(
  input: {
    query?: string
    url?: string
    clicks?: number
    impressions?: number
    ctr?: number
    position?: number
    keys?: string[]
  } = {},
): GscRow {
  const clicks = input.clicks ?? 4
  const impressions = input.impressions ?? 200
  return {
    keys: input.keys ?? [
      input.query ?? 'technical seo guide',
      input.url ?? 'https://acme.test/guide',
    ],
    clicks,
    impressions,
    ctr: input.ctr ?? clicks / impressions,
    position: input.position ?? 12,
  }
}

test('uses the decimal >10 to <=20 boundary without a CTR gate', () => {
  const result = analyzeStrikingDistanceRows({
    site,
    rows: [
      row({ query: 'position ten', position: 10 }),
      row({
        query: 'position ten point one',
        position: 10.1,
        ctr: 0.9,
        clicks: 180,
      }),
      row({ query: 'position twenty', position: 20 }),
      row({ query: 'position twenty point one', position: 20.1 }),
    ],
  })

  assert.deepEqual(
    result.items.map((item) => item.query),
    ['position ten point one', 'position twenty'],
  )
  assert.equal(result.selection.outsidePositionRows, 2)
  assert.equal(result.methodology.ctrEligibilityFilter, false)
})

test('requires distinct URLs and credible templates for shared-template candidates', () => {
  const oneUrl = analyzeStrikingDistanceRows({
    site,
    rows: [
      row({ query: 'calculator one', url: 'https://acme.test/tools/calc' }),
      row({ query: 'calculator two', url: 'https://acme.test/tools/calc' }),
      row({ query: 'calculator three', url: 'https://acme.test/tools/calc' }),
    ],
  })
  const multipleUrls = analyzeStrikingDistanceRows({
    site,
    limit: 1,
    rows: [
      row({ query: 'calculator one', url: 'https://acme.test/tools/one' }),
      row({ query: 'calculator two', url: 'https://acme.test/tools/two' }),
    ],
  })
  const lowConfidence = analyzeStrikingDistanceRows({
    site,
    rows: [
      row({ query: 'guide one', url: 'https://acme.test/blog/one' }),
      row({ query: 'guide two', url: 'https://acme.test/blog/two' }),
    ],
  })

  assert.equal(oneUrl.groups[0]?.uniqueUrls, 1)
  assert.equal(oneUrl.groups[0]?.uniqueQueries, 3)
  assert.equal(oneUrl.groups[0]?.actionScope, 'page-level-review')
  assert.equal(multipleUrls.items.length, 1)
  assert.equal(multipleUrls.groups[0]?.uniqueUrls, 2)
  assert.equal(multipleUrls.groups[0]?.actionScope, 'shared-template-candidate')
  assert.equal(lowConfidence.groups[0]?.template.confidence, 'low')
  assert.equal(lowConfidence.groups[0]?.actionScope, 'page-level-review')
})

test('distinguishes empty, filtered, and available data', () => {
  const empty = analyzeStrikingDistanceRows({ site, rows: [] })
  const filtered = analyzeStrikingDistanceRows({
    site,
    rows: [row({ position: 5 })],
  })
  const available = analyzeStrikingDistanceRows({ site, rows: [row()] })

  assert.equal(empty.dataStatus, 'empty')
  assert.equal(filtered.dataStatus, 'filtered')
  assert.equal(available.dataStatus, 'available')
  assert.equal(
    available.methodology.grouping.population,
    'all_eligible_rows_before_limit',
  )
})

test('treats the bare domain stem as brand only with navigational evidence', () => {
  const generic = analyzeStrikingDistanceRows({
    site: 'sc-domain:example.dev',
    rows: [
      row({ query: 'example', position: 34, clicks: 0, impressions: 900 }),
      row({ query: 'image example api', url: 'https://example.dev/a' }),
      row({ query: 'example.dev pricing', url: 'https://example.dev/p' }),
    ],
  })
  assert.deepEqual(
    generic.items.map((item) => item.query),
    ['image example api'],
  )
  assert.equal(generic.selection.brandRows, 1)
  assert.equal(generic.brand.source, 'search-console-navigational')
  assert.deepEqual(generic.brand.terms, [
    'example.dev',
    'example dev',
    'exampledev',
    'example-dev',
  ])
  assert.equal(generic.brand.excluded[0]?.term, 'example')

  const navigational = analyzeStrikingDistanceRows({
    site: 'sc-domain:acme.test',
    rows: [
      row({ query: 'acme', position: 1.2, clicks: 80, impressions: 200 }),
      row({ query: 'acme pricing', url: 'https://acme.test/pricing' }),
    ],
  })
  assert.equal(navigational.selection.brandRows, 1)
  assert.equal(navigational.items.length, 0)
  assert.ok(navigational.brand.terms.includes('acme'))
})

test('merges #fragment URLs and ranks heuristic query flags last', () => {
  const result = analyzeStrikingDistanceRows({
    site: 'sc-domain:example.dev',
    minImpressions: 0,
    rows: [
      row({
        query: 'flux image api',
        url: 'https://example.dev/flux',
        impressions: 100,
        clicks: 1,
        position: 12,
      }),
      row({
        query: 'flux image api',
        url: 'https://example.dev/flux#pricing',
        impressions: 300,
        clicks: 2,
        position: 16,
      }),
      row({
        query:
          'aieos v1.1 skill.md manifest spec openai anthropic google llama mistral prompt',
        impressions: 5000,
        clicks: 0,
      }),
      row({ query: 'agentskills.io directory', impressions: 4000, clicks: 0 }),
      row({ query: 'skills sh', impressions: 3000, clicks: 0 }),
    ],
  })

  assert.equal(result.selection.fragmentRows, 1)
  assert.equal(result.selection.mergedRows, 1)
  assert.equal(result.selection.likelyAutomatedRows, 1)
  assert.equal(result.selection.navigationalOtherRows, 2)
  assert.equal(result.selection.flaggedRows, 3)
  const first = result.items[0]
  assert.equal(first?.query, 'flux image api')
  assert.equal(first?.url, 'https://example.dev/flux')
  assert.equal(first?.impressions, 400)
  assert.equal(first?.position, 15)
  assert.deepEqual(first?.queryFlags, [])
  assert.deepEqual(
    result.items.slice(1).map((item) => item.queryFlags),
    [['likely-automated'], ['navigational-other'], ['navigational-other']],
  )
  assert.equal(result.methodology.queryFlags.heuristic, true)
})
