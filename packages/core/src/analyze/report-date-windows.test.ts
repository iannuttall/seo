import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SearchAnalyticsRequest } from '../gsc/client/types.js'
import type { GscRow } from '../types.js'
import { ctrUnderperformersReportWith } from './ctr-underperformers-report.js'
import { secondPageWith } from './second-page-report.js'
import { strikingDistanceWith } from './striking-distance-report.js'
import { trafficAnomalyWith } from './traffic-anomaly-report.js'

const now = () => new Date('2026-07-09T12:00:00.000Z')
const window = { startDate: '2026-05-01', endDate: '2026-05-31' }

function recorder(rows: GscRow[] = []) {
  const requests: SearchAnalyticsRequest[] = []
  return {
    requests,
    searchAnalytics: async (_site: string, request: SearchAnalyticsRequest) => {
      requests.push(request)
      return { rows, calls: 1, rowsFetched: rows.length }
    },
  }
}

test('ctr, striking-distance and second-page accept an explicit window', async () => {
  const site = 'sc-domain:example.com'
  const ctr = recorder()
  const ctrReport = await ctrUnderperformersReportWith(
    { site, ...window },
    { searchAnalytics: ctr.searchAnalytics, now },
  )
  const striking = recorder()
  const strikingReport = await strikingDistanceWith(
    { site, ...window },
    { searchAnalytics: striking.searchAnalytics, now },
  )
  const second = recorder()
  const secondReport = await secondPageWith(
    { site, ...window },
    { searchAnalytics: second.searchAnalytics, now },
  )

  for (const [report, requests] of [
    [ctrReport, ctr.requests],
    [strikingReport, striking.requests],
    [secondReport, second.requests],
  ] as const) {
    assert.deepEqual(report.range, window)
    assert.equal(report.rangeDays, 31)
    assert.equal(requests[0]?.startDate, window.startDate)
    assert.equal(requests[0]?.endDate, window.endDate)
  }
})

test('date windows keep defaults and reject half or inverted ranges', async () => {
  const site = 'sc-domain:example.com'
  const ctr = recorder()
  const report = await ctrUnderperformersReportWith(
    { site, days: 7 },
    { searchAnalytics: ctr.searchAnalytics, now },
  )
  assert.equal(report.rangeDays, 7)
  const second = await secondPageWith(
    { site },
    { searchAnalytics: recorder().searchAnalytics, now },
  )
  assert.equal(second.rangeDays, 28)
  assert.deepEqual(second.range, second.dateRange)

  for (const run of [
    () =>
      ctrUnderperformersReportWith(
        { site, startDate: '2026-05-01' },
        { searchAnalytics: recorder().searchAnalytics, now },
      ),
    () =>
      strikingDistanceWith(
        { site, startDate: '2026-05-31', endDate: '2026-05-01' },
        { searchAnalytics: recorder().searchAnalytics, now },
      ),
    () =>
      secondPageWith(
        { site, endDate: '2026-05-31' },
        { searchAnalytics: recorder().searchAnalytics, now },
      ),
  ]) {
    await assert.rejects(run, /Start date and end date/)
  }
})

test('traffic anomaly reports its range and selection counts', async () => {
  const rows: GscRow[] = []
  for (let day = 1; day <= 30; day++) {
    rows.push({
      keys: [`2026-06-${String(day).padStart(2, '0')}`],
      clicks: 10,
      impressions: 100,
      ctr: 0.1,
      position: 5,
    })
  }
  const report = await trafficAnomalyWith(
    {
      site: 'sc-domain:example.com',
      ...{ startDate: '2026-06-01', endDate: '2026-06-30' },
    },
    { searchAnalytics: recorder(rows).searchAnalytics, now },
  )
  assert.deepEqual(report.range, {
    startDate: '2026-06-01',
    endDate: '2026-06-30',
  })
  assert.deepEqual(report.selection, {
    sourceRows: 30,
    invalidRows: 0,
    duplicateRows: 0,
    observedDays: 30,
    expectedDays: 30,
    missingDays: 0,
    baselineDays: 23,
    comparisonDays: 7,
  })
})
