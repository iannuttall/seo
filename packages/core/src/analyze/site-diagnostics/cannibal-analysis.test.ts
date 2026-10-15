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
