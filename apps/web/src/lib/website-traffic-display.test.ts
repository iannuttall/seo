import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTrafficHistoryCsv,
  sumKnownTrafficCounts,
  type TrafficHistoryDisplayRow,
} from './website-traffic-display.ts'

test('keeps missing position buckets distinct from zero', () => {
  assert.equal(sumKnownTrafficCounts([1, 2, 3]), 6)
  assert.equal(sumKnownTrafficCounts([1, null, 3]), null)
})

test('exports missing traffic and movement values as N/A', () => {
  const row: TrafficHistoryDisplayRow = {
    month: '2026-08',
    estimatedOrganicTraffic: null,
    rankingResults: 12,
    estimatedTrafficValueUsd: null,
    positions: {
      first: 1,
      secondToThird: null,
      fourthToTenth: 4,
    },
    movement: { new: 2, up: null, down: 3, lost: null },
  }

  assert.equal(
    buildTrafficHistoryCsv([row]),
    [
      'year,month,estimated_organic_traffic,ranking_keywords,estimated_traffic_value_usd,top_3,top_10,new,up,down,lost',
      '2026,08,N/A,12,N/A,N/A,N/A,2,N/A,3,N/A',
    ].join('\n'),
  )
})
