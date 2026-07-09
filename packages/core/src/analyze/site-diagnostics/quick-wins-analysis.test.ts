import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GscRow } from '../../types.js'
import { analyzeQuickWinsFromRows } from './quick-wins-analysis.js'

function row(input: {
  query: string
  url: string
  clicks: number
  impressions: number
  position: number
  ctr?: number
}): GscRow {
  return {
    keys: [input.query, input.url],
    clicks: input.clicks,
    impressions: input.impressions,
    ctr:
      input.ctr ?? (input.impressions ? input.clicks / input.impressions : 0),
    position: input.position,
  }
}

function peerRows(clicks = [20, 18, 15, 12, 10], position = 9): GscRow[] {
  return clicks.map((value, index) =>
    row({
      query: `seo peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks: value,
      impressions: 1000,
      position,
    }),
  )
}

test('uses an all-sample leave-target-URL-out CTR heuristic', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 9,
  })
  const sameUrl = row({
    query: 'seo audit software',
    url: 'https://example.com/audit/#features',
    clicks: 500,
    impressions: 1000,
    position: 5,
  })
  const result = analyzeQuickWinsFromRows({
    rows: [candidate, sameUrl, ...peerRows()],
    site: 'sc-domain:example.com',
  })
  const item = result.items.find(
    (quickWin) => quickWin.query === candidate.keys[0],
  )

  assert.ok(item)
  assert.equal(item.targetCtr, 0.018)
  assert.equal(item.estimatedCtrClickShortfall, 180)
  assert.equal(item.benchmark.excludedTargetRows, 2)
  assert.equal(item.benchmark.peerRows, 5)
  assert.equal(item.benchmark.qualifiedPeerImpressions, 5000)
  assert.match(item.benchmark.source, /leave_target_url_out/)
  assert.equal(item.benchmark.samplePopulation, 'all_qualified_url_samples')
  assert.equal(item.priority.estimatedClickLift, false)
  assert.equal(Object.hasOwn(item, 'expectedCtr'), false)
  assert.equal(Object.hasOwn(item, 'estimatedClickLift'), false)
  assert.match(
    item.recommendation.impactEstimate ?? '',
    /not a traffic forecast/,
  )
})

test('includes zero-CTR qualified URLs in the site percentile', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 9,
  })
  const result = analyzeQuickWinsFromRows({
    rows: [candidate, ...peerRows([0, 0, 10, 20, 30])],
    site: 'sc-domain:example.com',
  })

  assert.equal(result.items[0]?.targetCtr, 0.02)
  assert.equal(result.items[0]?.benchmark.urlSamples, 5)
  assert.equal(result.items[0]?.benchmark.positiveUrlSamples, 3)
})

test('treats a zero site percentile as evidence before applying the floor', () => {
  const peers = peerRows([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 20, 30])
  const result = analyzeQuickWinsFromRows({
    rows: [
      row({
        query: 'technical seo audit',
        url: 'https://example.com/audit',
        clicks: 0,
        impressions: 10_000,
        position: 9,
      }),
      ...peers,
    ],
    site: 'sc-domain:example.com',
  })

  assert.equal(result.items[0]?.targetCtr, 0.0075)
  assert.match(result.items[0]?.benchmark.source ?? '', /site_gsc_.*floored/)
  assert.doesNotMatch(
    result.items[0]?.benchmark.source ?? '',
    /builtin_position_ctr_curve/,
  )
})

test('publishes versioned fallback provenance for sparse peers', () => {
  const result = analyzeQuickWinsFromRows({
    rows: [
      row({
        query: 'technical seo audit',
        url: 'https://example.com/audit',
        clicks: 0,
        impressions: 10_000,
        position: 9,
      }),
      ...peerRows([20, 18, 15, 12]),
    ],
    site: 'sc-domain:example.com',
  })

  assert.equal(result.items[0]?.targetCtr, 0.015)
  assert.equal(
    result.items[0]?.benchmark.source,
    'builtin_position_ctr_curve_v1',
  )
  assert.deepEqual(result.methodology.benchmark.fallback, {
    id: 'seo_builtin_position_ctr',
    version: 1,
    kind: 'built_in_heuristic',
    curve: {
      '1': 0.27,
      '2': 0.15,
      '3': 0.1,
      '4': 0.07,
      '5': 0.05,
      '6': 0.035,
      '7': 0.025,
      '8': 0.02,
      '9': 0.015,
      '10': 0.012,
    },
  })
})

test('validates rows and records sequential sparse states', () => {
  const invalid: GscRow[] = [
    row({
      query: 'bad url',
      url: '/relative',
      clicks: 0,
      impressions: 1000,
      position: 8,
    }),
    row({
      query: 'bad ctr',
      url: 'https://example.com/bad',
      clicks: 0,
      impressions: 1000,
      position: 8,
      ctr: Number.NaN,
    }),
    row({
      query: 'too many clicks',
      url: 'https://example.com/clicks',
      clicks: 1001,
      impressions: 1000,
      position: 8,
    }),
  ]
  const result = analyzeQuickWinsFromRows({
    rows: [
      ...invalid,
      row({
        query: 'page two',
        url: 'https://example.com/two',
        clicks: 0,
        impressions: 1000,
        position: 10.001,
      }),
      row({
        query: 'example login',
        url: 'https://example.com/login',
        clicks: 0,
        impressions: 1000,
        position: 8,
      }),
      row({
        query: 'low demand',
        url: 'https://example.com/low',
        clicks: 0,
        impressions: 199,
        position: 8,
      }),
    ],
    site: 'sc-domain:example.com',
    brandTerms: ['example'],
  })

  assert.equal(result.dataStatus, 'filtered')
  assert.equal(result.selection.invalidRows, 3)
  assert.equal(result.selection.outsideBenchmarkPositionRows, 1)
  assert.equal(result.selection.brandRows, 1)
  assert.equal(result.selection.belowMinimumRows, 1)
})

test('uses inclusive GSC average-position boundaries from 4 through 10', () => {
  const result = analyzeQuickWinsFromRows({
    rows: [
      row({
        query: 'below boundary',
        url: 'https://example.com/below',
        clicks: 0,
        impressions: 1000,
        position: 3.999,
      }),
      row({
        query: 'lower boundary',
        url: 'https://example.com/lower',
        clicks: 0,
        impressions: 1000,
        position: 4,
      }),
      row({
        query: 'upper boundary',
        url: 'https://example.com/upper',
        clicks: 0,
        impressions: 1000,
        position: 10,
      }),
      row({
        query: 'above boundary',
        url: 'https://example.com/above',
        clicks: 0,
        impressions: 1000,
        position: 10.001,
      }),
    ],
    site: 'sc-domain:example.com',
  })

  assert.deepEqual(result.items.map((item) => item.query).sort(), [
    'lower boundary',
    'upper boundary',
  ])
  assert.equal(result.selection.outsideCandidatePositionRows, 1)
  assert.equal(result.selection.outsideBenchmarkPositionRows, 1)
})

test('bounds options, preserves totals, and is input-order deterministic', () => {
  const rows = Array.from({ length: 120 }, (_, index) =>
    row({
      query: 'technical seo guide',
      url: `https://example.com/page-${index}`,
      clicks: 0,
      impressions: 1000 + index,
      position: 8,
    }),
  )
  const forward = analyzeQuickWinsFromRows({
    rows,
    site: 'sc-domain:example.com',
    minImpressions: -1,
    limit: 500,
  })
  const reverse = analyzeQuickWinsFromRows({
    rows: [...rows].reverse(),
    site: 'sc-domain:example.com',
    minImpressions: -1,
    limit: 500,
  })

  assert.equal(forward.minImpressions, 0)
  assert.equal(forward.limit, 100)
  assert.equal(forward.selection.eligibleRows, 120)
  assert.equal(forward.selection.returnedRows, 100)
  assert.equal(forward.selection.limitedRows, 20)
  assert.deepEqual(forward.items, reverse.items)
  assert.deepEqual(forward.selection, reverse.selection)
})
