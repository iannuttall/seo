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

test('ranks matched retained segments by real movement', () => {
  const report = compareSegmentRows({
    site: 'sc-domain:example.com',
    dimension: 'page',
    before,
    after,
    beforeRows: [row('/a', 100, 1000, 4), row('/b', 10, 100, 7)],
    afterRows: [row('/a', 20, 800, 8), row('/b', 35, 200, 5)],
    generatedAt: '2026-05-30T12:00:00.000Z',
  })

  assert.equal(report.schemaVersion, 2)
  assert.equal(report.items[0]?.key, '/a')
  assert.equal(report.items[0]?.clickDelta, -80)
  assert.equal(report.items[0]?.positionDelta, 4)
  assert.equal(report.items[1]?.key, '/b')
  assert.equal(report.items[1]?.clickDelta, 25)
  assert.equal(report.dataStatus, 'complete')
})

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

test('returns unavailable when no retained segment is comparable', () => {
  const report = compareSegmentRows({
    site: 'sc-domain:example.com',
    dimension: 'query',
    before,
    after,
    beforeRows: [row('before only', 10)],
    afterRows: [row('after only', 20)],
  })

  assert.equal(report.dataStatus, 'unavailable')
  assert.equal(report.items.length, 0)
  assert.match(report.summary.verdict, /no movement delta was inferred/i)
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

test('rejects non-adjacent or invalid explicit comparison ranges', () => {
  assert.throws(
    () =>
      compareSegmentRows({
        site: 'sc-domain:example.com',
        dimension: 'page',
        before,
        after: { startDate: '2026-05-01', endDate: '2026-05-28' },
        beforeRows: [],
        afterRows: [],
      }),
    /must be adjacent/,
  )
  assert.throws(
    () =>
      compareSegmentRows({
        site: 'sc-domain:example.com',
        dimension: 'page',
        before,
        after: { startDate: '2026-02-30', endDate: '2026-03-29' },
        beforeRows: [],
        afterRows: [],
      }),
    /valid YYYY-MM-DD/,
  )
})

test('does not publish average position without impressions', () => {
  const report = compareSegmentRows({
    site: 'sc-domain:example.com',
    dimension: 'query',
    before,
    after,
    beforeRows: [row('zero impression', 0, 0, 0)],
    afterRows: [row('zero impression', 0, 0, 0)],
  })

  assert.equal(report.items[0]?.beforePosition, null)
  assert.equal(report.items[0]?.afterPosition, null)
  assert.equal(report.items[0]?.positionDelta, null)
})

test('uses deterministic key ordering for equal movement', () => {
  const report = compareSegmentRows({
    site: 'sc-domain:example.com',
    dimension: 'page',
    before,
    after,
    beforeRows: [row('/z', 10), row('/a', 10)],
    afterRows: [row('/z', 20), row('/a', 20)],
  })

  assert.deepEqual(
    report.items.map((item) => item.key),
    ['/a', '/z'],
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

test('excludes malformed provider dimensions and metrics', () => {
  const report = compareSegmentRows({
    site: 'sc-domain:example.com',
    dimension: 'page',
    before,
    after,
    beforeRows: [
      row('/valid', 10),
      row('', 2),
      row('/fractional-clicks', 1.5),
      { ...row('/two-keys', 3), keys: ['/two-keys', 'unexpected'] },
    ],
    afterRows: [row('/valid', 12)],
  })

  assert.deepEqual(
    report.items.map((item) => item.key),
    ['/valid'],
  )
  assert.equal(report.selection.beforeInvalidRows, 3)
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
