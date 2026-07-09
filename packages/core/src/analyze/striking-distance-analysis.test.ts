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

test('validates rows and records exclusions in a stable sequential order', () => {
  const result = analyzeStrikingDistanceRows({
    site,
    rows: [
      row({ query: '', position: 5 }),
      row({ query: 'bad url', url: 'not-a-url' }),
      row({ query: 'bad metrics', impressions: Number.NaN }),
      row({ query: 'wrong position', position: 9 }),
      row({ query: 'too small', impressions: 99, clicks: 1 }),
      row({ query: 'site:example.com technical seo' }),
      row({ query: 'acme pricing' }),
      row({ query: 'eligible technical query' }),
    ],
  })

  assert.deepEqual(result.selection, {
    sourceRows: 8,
    invalidRows: 3,
    outsidePositionRows: 1,
    belowMinimumRows: 1,
    lowActionabilityRows: 1,
    brandRows: 1,
    eligibleRows: 1,
    returnedRows: 1,
    limitedRows: 0,
  })
  assert.deepEqual(result.provenance.selectionOrder, [
    'valid_row',
    'position',
    'minimum_impressions',
    'query_quality',
    'brand',
  ])
})

test('normalizes numeric options and keeps all-eligible totals before limit', () => {
  const rows = [
    row({ query: 'alpha guide', impressions: 300 }),
    row({ query: 'beta guide', impressions: 200 }),
    row({ query: 'gamma guide', impressions: 100 }),
  ]
  const bounded = analyzeStrikingDistanceRows({
    site,
    rows,
    minImpressions: -10,
    limit: 0,
  })
  const fallback = analyzeStrikingDistanceRows({
    site,
    rows,
    minImpressions: Number.POSITIVE_INFINITY,
    limit: Number.NaN,
  })

  assert.equal(bounded.minImpressions, 0)
  assert.equal(bounded.limit, 1)
  assert.equal(bounded.selection.eligibleRows, 3)
  assert.equal(bounded.selection.returnedRows, 1)
  assert.equal(bounded.selection.limitedRows, 2)
  assert.equal(bounded.summary.eligibleImpressions, 600)
  assert.equal(bounded.summary.returnedImpressions, 300)
  assert.equal(bounded.groups[0]?.rowCount, 3)
  assert.equal(fallback.minImpressions, 100)
  assert.equal(fallback.limit, 25)
})

test('publishes transparent heuristic priority components without click lift', () => {
  const result = analyzeStrikingDistanceRows({
    site,
    rows: [
      row({ query: 'close result', impressions: 100, position: 11 }),
      row({ query: 'distant result', impressions: 500, position: 20 }),
    ],
  })

  assert.equal(result.items[0]?.query, 'close result')
  assert.deepEqual(result.items[0]?.priority, {
    method: 'impressions_x_position_proximity',
    score: 100,
    demandImpressions: 100,
    positionProximity: 1,
    heuristic: true,
    estimatedClickLift: false,
  })
  assert.equal(result.items[1]?.priority.score, 50)
  assert.equal(result.methodology.priority.heuristic, true)
  assert.equal(result.methodology.priority.estimatedClickLift, false)
})

test('uses deterministic codepoint ordering for complete priority ties', () => {
  const privateUse = '\uE000 technical seo'
  const astral = '😀 technical seo'
  const inputRows = [row({ query: astral }), row({ query: privateUse })]
  const forward = analyzeStrikingDistanceRows({ site, rows: inputRows })
  const reverse = analyzeStrikingDistanceRows({
    site,
    rows: [...inputRows].reverse(),
  })

  assert.deepEqual(
    forward.items.map((item) => item.query),
    [privateUse, astral],
  )
  assert.deepEqual(reverse.items, forward.items)
})

test('excludes configured and derived Unicode brand terms', () => {
  const explicit = analyzeStrikingDistanceRows({
    site,
    brandTerms: ['品牌'],
    rows: [row({ query: '品牌 評測' }), row({ query: '技術 seo 指南' })],
  })
  const derived = analyzeStrikingDistanceRows({
    site: 'sc-domain:品牌.公司',
    rows: [row({ query: '品牌 評測', url: 'https://品牌.公司/review' })],
  })
  const included = analyzeStrikingDistanceRows({
    site,
    brandTerms: ['品牌'],
    includeBrand: true,
    rows: [row({ query: '品牌 評測' }), row({ query: '技術 seo 指南' })],
  })

  assert.equal(explicit.selection.brandRows, 1)
  assert.deepEqual(
    explicit.items.map((item) => item.query),
    ['技術 seo 指南'],
  )
  assert.equal(derived.selection.brandRows, 1)
  assert.equal(derived.items.length, 0)
  assert.equal(included.items.length, 2)
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
  assert.match(
    lowConfidence.groups[0]?.recommendation.action ?? '',
    /does not support a shared-template change/,
  )
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
