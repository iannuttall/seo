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
    minImpressions: 100,
    rows: [
      row({ query: '', position: 5 }),
      row({ query: 'bad url', url: 'not-a-url' }),
      row({ query: 'bad metrics', impressions: Number.NaN }),
      row({ query: 'wrong position', position: 9 }),
      row({ query: 'too small', impressions: 99, clicks: 1 }),
      row({ query: 'site:example.com technical seo' }),
      row({ query: 'acme.test pricing' }),
      row({ query: 'eligible technical query' }),
    ],
  })

  assert.deepEqual(result.selection, {
    sourceRows: 8,
    fragmentRows: 0,
    mergedRows: 0,
    invalidRows: 3,
    outsidePositionRows: 1,
    belowMinimumRows: 1,
    lowActionabilityRows: 1,
    brandRows: 1,
    eligibleRows: 1,
    likelyAutomatedRows: 0,
    navigationalOtherRows: 0,
    flaggedRows: 0,
    returnedRows: 1,
    limitedRows: 0,
  })
  assert.equal(result.minImpressionsPolicy.source, 'explicit')
  assert.deepEqual(result.provenance.selectionOrder, [
    'fragment_and_duplicate_merge',
    'valid_row',
    'position',
    'minimum_impressions',
    'query_quality',
    'brand',
    'query_flag_ranking',
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
  // A non-finite request falls back to the scaled default: 600 retained
  // impressions scale below the floor, so the floor of 10 applies.
  assert.equal(fallback.minImpressions, 10)
  assert.equal(fallback.minImpressionsPolicy.source, 'scaled-default')
  assert.equal(fallback.minImpressionsPolicy.basisImpressions, 600)
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
    rows: [
      // Navigational evidence for the bare stem: the site is its top answer.
      row({
        query: '品牌',
        url: 'https://品牌.公司/',
        position: 1.1,
        clicks: 60,
        impressions: 100,
      }),
      row({ query: '品牌 評測', url: 'https://品牌.公司/review' }),
    ],
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

test('treats the bare domain stem as brand only with navigational evidence', () => {
  const generic = analyzeStrikingDistanceRows({
    site: 'sc-domain:inference.sh',
    rows: [
      row({ query: 'inference', position: 34, clicks: 0, impressions: 900 }),
      row({ query: 'image inference api', url: 'https://inference.sh/a' }),
      row({ query: 'inference.sh pricing', url: 'https://inference.sh/p' }),
    ],
  })
  assert.deepEqual(
    generic.items.map((item) => item.query),
    ['image inference api'],
  )
  assert.equal(generic.selection.brandRows, 1)
  assert.equal(generic.brand.source, 'search-console-navigational')
  assert.deepEqual(generic.brand.terms, [
    'inference.sh',
    'inference sh',
    'inferencesh',
    'inference-sh',
  ])
  assert.equal(generic.brand.excluded[0]?.term, 'inference')

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

test('scales the default minimum with retained impressions and records it', () => {
  const rows = [
    row({ query: 'large head term', position: 3, impressions: 400_000 }),
    row({ query: 'long tail guide', impressions: 60 }),
    row({ query: 'bigger tail guide', impressions: 90 }),
  ]
  const result = analyzeStrikingDistanceRows({ site, rows })
  // 400,150 retained impressions x 1/5000 = 80.03, rounded up to 81.
  assert.equal(result.minImpressions, 81)
  assert.equal(result.minImpressionsPolicy.source, 'scaled-default')
  assert.equal(result.minImpressionsPolicy.basisImpressions, 400_150)
  assert.deepEqual(
    result.items.map((item) => item.query),
    ['bigger tail guide'],
  )
  assert.equal(result.selection.belowMinimumRows, 1)

  const large = analyzeStrikingDistanceRows({
    site,
    rows: [row({ query: 'head', position: 2, impressions: 5_000_000 })],
  })
  assert.equal(large.minImpressions, 100)
})

test('merges #fragment URLs and ranks heuristic query flags last', () => {
  const result = analyzeStrikingDistanceRows({
    site: 'sc-domain:inference.sh',
    minImpressions: 0,
    rows: [
      row({
        query: 'flux image api',
        url: 'https://inference.sh/flux',
        impressions: 100,
        clicks: 1,
        position: 12,
      }),
      row({
        query: 'flux image api',
        url: 'https://inference.sh/flux#pricing',
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
  assert.equal(first?.url, 'https://inference.sh/flux')
  assert.equal(first?.impressions, 400)
  assert.equal(first?.position, 15)
  assert.deepEqual(first?.queryFlags, [])
  assert.deepEqual(
    result.items.slice(1).map((item) => item.queryFlags),
    [['likely-automated'], ['navigational-other'], ['navigational-other']],
  )
  assert.equal(result.methodology.queryFlags.heuristic, true)
})
