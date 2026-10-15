import assert from 'node:assert/strict'
import test from 'node:test'
import type { GscRow } from '../types.js'
import {
  findOverlappingSearchUpdates,
  type SearchUpdate,
} from '../updates/search-status.js'
import {
  analyzeTrafficAnomalyRows,
  changeWindow,
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

test('large movement during an update remains overlap evidence, not attribution', () => {
  const result = interpretUpdateCorrelation({
    site: 'sc-domain:example.com',
    anomalies: [
      anomaly('clicks', 'spike', 100, 260, 160, 8),
      anomaly('impressions', 'spike', 1_000, 2_100, 110, 6),
    ],
    overlappingUpdates: [update],
    days: 180,
    recentDays: 14,
    paddingDays: 7,
  })

  assert.equal(result.attribution, 'not-established')
  assert.equal(result.confidence, 'none')
  assert.equal(
    result.classification,
    'significant-movement-with-update-overlap',
  )
})

test('uses calendar boundaries instead of treating returned rows as consecutive days', () => {
  const result = analyzeTrafficAnomalyRows({
    site: 'sc-domain:example.com',
    rows: [
      ...dailyRows('2026-01-01', 22, 100),
      row('2026-01-23', 200),
      row('2026-01-24', 200),
      row('2026-01-26', 200),
    ],
    startDate: '2026-01-01',
    endDate: '2026-01-26',
    recentDays: 4,
  })

  const clicks = result.anomalies.find((item) => item.metric === 'clicks')
  assert.equal(clicks?.baselineEnd, '2026-01-22')
  assert.equal(clicks?.comparisonStart, '2026-01-23')
  assert.equal(clicks?.comparisonMean, 200)
  assert.equal(result.coverage.status, 'partial')
  assert.deepEqual(result.coverage.comparison, {
    start: '2026-01-23',
    end: '2026-01-26',
    expectedDays: 4,
    observedDays: 3,
    missingDays: 1,
  })
})

test('does not invent a percentage increase from a zero baseline', () => {
  const result = analyzeTrafficAnomalyRows({
    site: 'sc-domain:example.com',
    rows: [
      ...dailyRows('2026-01-01', 20, 0),
      ...dailyRows('2026-01-21', 4, 10),
    ],
    startDate: '2026-01-01',
    endDate: '2026-01-24',
    recentDays: 4,
  })

  const clicks = result.anomalies.find((item) => item.metric === 'clicks')
  assert.equal(clicks?.percentChange, null)
  assert.equal(clicks?.significanceMethod, 'outside-flat-baseline')
  assert.equal(clicks?.significant, true)
})

test('aggregates duplicate dates deterministically and exposes provider provenance', () => {
  const rows = [
    ...dailyRows('2026-01-01', 20, 100),
    ...dailyRows('2026-01-21', 4, 100),
    row('2026-01-24', 50),
    row('not-a-date', 10),
  ]
  const input = {
    site: 'sc-domain:example.com',
    startDate: '2026-01-01',
    endDate: '2026-01-24',
    recentDays: 4,
  }
  const forward = analyzeTrafficAnomalyRows({ ...input, rows })
  const reversed = analyzeTrafficAnomalyRows({
    ...input,
    rows: [...rows].reverse(),
  })

  assert.deepEqual(forward.anomalies, reversed.anomalies)
  assert.equal(forward.coverage.returnedRows, 26)
  assert.equal(forward.coverage.observedDays, 24)
  assert.equal(forward.coverage.duplicateRows, 1)
  assert.equal(forward.coverage.invalidRows, 1)
  assert.equal(forward.coverage.status, 'partial')
  assert.equal(
    forward.anomalies.find((item) => item.metric === 'clicks')?.comparisonTotal,
    450,
  )
})

// Regression: a sustained cliff on 4 May was placed on the last 7 days of
// the default 90-day window, compared with a baseline that held the
// post-cliff days, and matched to a core update that started 17 days later.
test('finds a sustained cliff at its real start date and checks updates there', () => {
  const weekly = [1, 1.08, 1.1, 1.06, 0.98, 0.78, 0.74]
  const rows = Array.from({ length: 90 }, (_, index) => {
    const level = index < 63 ? 300 : 18
    const noise = 1 + (((index * 37) % 11) - 5) / 100
    const date = new Date(Date.UTC(2026, 2, 2 + index))
    return row(
      date.toISOString().slice(0, 10),
      Math.round(level * (weekly[index % 7] ?? 1) * noise),
    )
  })
  const result = analyzeTrafficAnomalyRows({
    site: 'sc-domain:example.com',
    rows,
    startDate: '2026-03-02',
    endDate: '2026-05-30',
    recentDays: 7,
  })

  const clicks = result.anomalies.find((item) => item.metric === 'clicks')
  assert.equal(clicks?.changeDate, '2026-05-04')
  assert.equal(clicks?.detection, 'step-change')
  assert.equal(clicks?.direction, 'drop')
  assert.equal(clicks?.baselineEnd, '2026-05-03')
  assert.ok((clicks?.percentChange ?? 0) < -90)

  const window = changeWindow(result.anomalies)
  assert.deepEqual(window, { start: '2026-05-04', end: '2026-05-04' })
  const overlapping = findOverlappingSearchUpdates({
    updates: [update],
    startDate: window?.start ?? '',
    endDate: window?.end ?? '',
    paddingDays: 3,
  })
  assert.deepEqual(overlapping, [])
})

function row(date: string, value: number): GscRow {
  return {
    keys: [date],
    clicks: value,
    impressions: value * 10,
    ctr: 0.1,
    position: 1,
  }
}

function dailyRows(start: string, days: number, value: number): GscRow[] {
  const startDate = new Date(`${start}T00:00:00.000Z`)
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(startDate)
    date.setUTCDate(date.getUTCDate() + index)
    return row(date.toISOString().slice(0, 10), value)
  })
}

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
    significanceMethod: direction === 'normal' ? 'none' : 'z-score',
    direction,
    significant: direction !== 'normal',
  }
}
