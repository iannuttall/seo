import assert from 'node:assert/strict'
import test from 'node:test'
import type { GscRow } from '../types.js'
import { compareSegmentRows, segmentImpact } from './segment-impact.js'

const before = { startDate: '2026-04-01', endDate: '2026-04-28' }
const after = { startDate: '2026-04-29', endDate: '2026-05-26' }

function row(
  key: string,
  clicks: number,
  impressions = clicks * 10,
  position = 5,
): GscRow {
  return {
    keys: [key],
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position,
  }
}

test('never converts one-window retained rows into zero traffic', () => {
  const report = compareSegmentRows({
    site: 'sc-domain:example.com',
    dimension: 'page',
    before,
    after,
    beforeRows: [row('/matched', 10), row('/gone', 30, 300, 3)],
    afterRows: [row('/matched', 15), row('/new', 40, 400, 9)],
  })

  assert.deepEqual(
    report.items.map((item) => item.key),
    ['/matched'],
  )
  assert.deepEqual(
    report.unmatchedSegments.map((item) => ({
      key: item.key,
      retainedIn: item.retainedIn,
      position: item.position,
    })),
    [
      { key: '/new', retainedIn: 'after', position: 9 },
      { key: '/gone', retainedIn: 'before', position: 3 },
    ],
  )
  assert.equal(report.selection.unmatchedBeforeRows, 1)
  assert.equal(report.selection.unmatchedAfterRows, 1)
  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.methodology.missingRowsTreatedAsZero, false)
})

test('rejects unequal comparison windows instead of comparing raw totals', async () => {
  await assert.rejects(
    segmentImpact(
      {
        site: 'sc-domain:example.com',
        days: 7,
        compareDays: 28,
      },
      {
        now: () => new Date('2026-06-01T12:00:00.000Z'),
        searchAnalytics: async () => ({ rows: [], calls: 1, rowsFetched: 0 }),
      },
    ),
    /compareDays must equal the 7-day current window/,
  )
})

test('deduplicates identical rows and excludes conflicting duplicates', () => {
  const report = compareSegmentRows({
    site: 'sc-domain:example.com',
    dimension: 'page',
    before,
    after,
    beforeRows: [
      row('/same', 10),
      row('/same', 10),
      row('/conflict', 4),
      row('/conflict', 8),
    ],
    afterRows: [row('/same', 12), row('/conflict', 10)],
  })

  assert.deepEqual(
    report.items.map((item) => item.key),
    ['/same'],
  )
  assert.equal(report.selection.beforeDuplicateRows, 1)
  assert.equal(report.selection.beforeConflictingRows, 1)
  assert.equal(report.dataStatus, 'partial')
})

test('queries bounded final GSC rows and publishes provider evidence', async () => {
  const requests: Array<Record<string, unknown>> = []
  let call = 0
  const report = await segmentImpact(
    {
      site: 'sc-domain:example.com',
      dimension: 'country',
      days: 28,
      maxRows: 50_000,
      refresh: true,
    },
    {
      now: () => new Date('2026-06-01T12:00:00.000Z'),
      searchAnalytics: async (_site, request, options) => {
        requests.push({ ...request, refresh: options?.refresh })
        call += 1
        return {
          rows: [row('gbr', call === 1 ? 10 : 15)],
          calls: 2,
          rowsFetched: 1,
        }
      },
    },
  )

  assert.equal(requests.length, 2)
  assert.equal(requests[0]?.maxRows, 50_000)
  assert.equal(requests[0]?.dataState, 'final')
  assert.equal(requests[0]?.aggregationType, 'auto')
  assert.equal(requests[0]?.refresh, true)
  assert.equal(report.source.before.calls, 2)
  assert.equal(report.source.after.calls, 2)
  assert.equal(report.source.completeness, 'retained-rows-only')
})

test('a retained-row cap makes movement evidence partial', () => {
  const report = compareSegmentRows({
    site: 'sc-domain:example.com',
    dimension: 'device',
    before,
    after,
    beforeRows: [row('mobile', 10)],
    afterRows: [row('mobile', 12)],
    maxRows: 1,
  })

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.source.before.possiblyTruncated, true)
  assert.equal(report.source.completeness, 'possibly-truncated')
})
