import assert from 'node:assert/strict'
import test from 'node:test'
import type { SearchUpdate } from '../updates/search-status.js'
import {
  interpretUpdateCorrelation,
  type TrafficAnomaly,
} from './traffic-anomaly.js'

const update: SearchUpdate = {
  id: 'may-core',
  name: 'May 2026 core update',
  type: 'core',
  product: 'Ranking',
  start: '2026-05-21T15:40:00+00:00',
  end: '2026-06-02T12:40:00+00:00',
  status: 'complete',
  sourceUrl: 'https://status.search.google.com/incidents/may-core',
}

test('interpretUpdateCorrelation gives high confidence for huge clean movement', () => {
  const result = interpretUpdateCorrelation({
    site: 'sc-domain:example.com',
    anomalies: [
      anomaly('clicks', 'spike', 100, 260, 160, 8),
      anomaly('impressions', 'spike', 1_000, 2_100, 110, 6),
    ],
    overlappingUpdates: [update],
    classification: 'likely-update-related',
    days: 180,
    recentDays: 14,
    paddingDays: 7,
  })

  assert.equal(result.attribution, 'very-likely-update-related')
  assert.equal(result.confidence, 'high')
  assert.match(result.summary, /very likely update-related/)
})

test('interpretUpdateCorrelation downgrades huge movement with confounders', () => {
  const result = interpretUpdateCorrelation({
    site: 'sc-domain:example.com',
    anomalies: [
      anomaly('clicks', 'drop', 260, 100, -62, -8),
      anomaly('impressions', 'drop', 2_100, 1_000, -52, -6),
    ],
    overlappingUpdates: [update],
    classification: 'likely-update-related',
    confounders: [
      {
        source: 'manual',
        title: 'blocked countries and removed pages',
      },
    ],
    days: 180,
    recentDays: 14,
    paddingDays: 7,
  })

  assert.equal(result.attribution, 'confounded')
  assert.equal(result.confidence, 'low')
  assert.match(result.summary, /known site change also overlaps/)
  assert.match(result.evidence.join('\n'), /blocked countries/)
})

function anomaly(
  metric: 'clicks' | 'impressions',
  direction: TrafficAnomaly['direction'],
  baselineMean: number,
  comparisonMean: number,
  percentChange: number,
  zScore: number,
): TrafficAnomaly {
  return {
    site: 'sc-domain:example.com',
    metric,
    baselineStart: '2026-01-01',
    baselineEnd: '2026-05-16',
    comparisonStart: '2026-05-17',
    comparisonEnd: '2026-05-30',
    baselineMean,
    comparisonMean,
    baselineTotal: baselineMean * 100,
    comparisonTotal: comparisonMean * 14,
    percentChange,
    zScore,
    direction,
    significant: direction !== 'normal',
  }
}
