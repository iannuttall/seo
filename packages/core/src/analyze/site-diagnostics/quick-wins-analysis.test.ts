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
