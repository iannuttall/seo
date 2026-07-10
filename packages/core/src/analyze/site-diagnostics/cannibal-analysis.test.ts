import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GscRow } from '../../types.js'
import { analyzeCannibalRows } from './cannibal-analysis.js'

function row(
  query: string,
  page: string,
  impressions: number,
  clicks = 10,
  position = 5,
): GscRow {
  return {
    keys: [query, page],
    clicks,
    impressions,
    ctr: clicks / impressions,
    position,
  }
}

function propertyRow(query: string, impressions: number): GscRow {
  return row(query, '', impressions, Math.min(20, impressions), 4)
}

test('retains a balanced two-URL candidate with property demand evidence', () => {
  const analysis = analyzeCannibalRows({
    site: 'sc-domain:example.com',
    rows: [
      row('technical seo audit', 'https://example.com/a', 60),
      row('technical seo audit', 'https://example.com/b', 60),
    ],
    propertyRows: [propertyRow('technical seo audit', 100)],
  })

  const item = analysis.items[0]
  assert.equal(analysis.selection.eligibleClusters, 1)
  assert.equal(item?.hhi, 0.5)
  assert.equal(item?.splitScore, 0.5)
  assert.equal(item?.propertyImpressions, 100)
  assert.equal(item?.pageExposureImpressions, 120)
  assert.equal(item?.observedPageExposureRatio, 1.2)
  assert.equal(item?.additionalUrlExposures, 20)
  assert.equal(item?.secondaryExposureShare, 0.5)
  assert.equal(item?.priority.score, 50)
  assert.equal(item?.priority.estimatedClickLift, false)
  assert.equal(item?.ownerSelection.confidence, 'low')
  assert.equal(item?.recommendation.confidence, 'low')
})

test('uses property impressions for the query threshold and filters dominant tails', () => {
  const belowThreshold = analyzeCannibalRows({
    site: 'sc-domain:example.com',
    rows: [
      row('seo audit', 'https://example.com/a', 60),
      row('seo audit', 'https://example.com/b', 40),
    ],
    propertyRows: [propertyRow('seo audit', 49)],
    minImpressions: 50,
  })
  assert.equal(belowThreshold.selection.belowMinimumQueries, 1)
  assert.equal(belowThreshold.items.length, 0)

  const dominant = analyzeCannibalRows({
    site: 'sc-domain:example.com',
    rows: [
      row('seo audit', 'https://example.com/a', 90),
      row('seo audit', 'https://example.com/b', 10),
    ],
    propertyRows: [propertyRow('seo audit', 100)],
  })
  assert.equal(dominant.selection.dominantQueries, 1)
  assert.equal(dominant.items.length, 0)
})

test('aggregates duplicate query/page rows without inventing another URL', () => {
  const analysis = analyzeCannibalRows({
    site: 'sc-domain:example.com',
    rows: [
      row('SEO Audit', 'https://example.com/a', 30, 3, 4),
      row('seo audit', 'https://example.com/a', 40, 4, 6),
    ],
    propertyRows: [propertyRow('seo audit', 70)],
  })

  assert.equal(analysis.selection.queryGroups, 1)
  assert.equal(analysis.selection.singlePageQueries, 1)
  assert.equal(analysis.items.length, 0)
})

test('keeps quoted and same-template candidates visible as review context', () => {
  const analysis = analyzeCannibalRows({
    site: 'sc-domain:example.com',
    rows: [
      row('"seo audit"', 'https://example.com/locations/london', 50),
      row('"seo audit"', 'https://example.com/locations/leeds', 50),
    ],
    propertyRows: [propertyRow('"seo audit"', 90)],
  })

  assert.equal(analysis.items.length, 1)
  assert.ok(analysis.items[0]?.reviewContext.includes('quoted-query'))
  assert.equal(analysis.selection.suppressedQueries, 0)
})

test('validates rows, bounds output, and sorts deterministically', () => {
  const rows = [
    row('beta audit', 'https://example.com/b1', 50),
    row('beta audit', 'https://example.com/b2', 50),
    row('alpha audit', 'https://example.com/a1', 50),
    row('alpha audit', 'https://example.com/a2', 50),
    { ...row('bad', 'not-a-url', 50), ctr: 2 },
  ]
  const propertyRows = [
    propertyRow('beta audit', 100),
    propertyRow('alpha audit', 100),
    { ...propertyRow('invalid property row', 100), ctr: 2 },
  ]
  const forward = analyzeCannibalRows({
    site: 'sc-domain:example.com',
    rows,
    propertyRows,
    limit: 1,
  })
  const reverse = analyzeCannibalRows({
    site: 'sc-domain:example.com',
    rows: [...rows].reverse(),
    propertyRows: [...propertyRows].reverse(),
    limit: 1,
  })

  assert.equal(forward.selection.invalidRows, 1)
  assert.equal(forward.selection.propertyInvalidRows, 1)
  assert.equal(forward.selection.propertySourceRows, 3)
  assert.equal(forward.selection.eligibleClusters, 2)
  assert.equal(forward.selection.returnedClusters, 1)
  assert.equal(forward.selection.limitedClusters, 1)
  assert.deepEqual(forward, reverse)
  assert.equal(forward.items[0]?.query, 'alpha audit')
})

test('normalizes unsafe pure-analysis options to documented bounds', () => {
  assert.deepEqual(
    analyzeCannibalRows({
      site: 'sc-domain:example.com',
      rows: [],
      minImpressions: Number.NaN,
      limit: Number.POSITIVE_INFINITY,
    }).filters,
    { minImpressions: 50, limit: 25, brand: 'excluded' },
  )
  assert.deepEqual(
    analyzeCannibalRows({
      site: 'sc-domain:example.com',
      rows: [],
      minImpressions: -1,
      limit: 500,
    }).filters,
    { minImpressions: 0, limit: 100, brand: 'excluded' },
  )
})
