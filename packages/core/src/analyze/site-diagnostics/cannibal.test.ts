import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SearchAnalyticsRequest } from '../../gsc/client.js'
import type { GscRow } from '../../types.js'
import { type CannibalDependencies, cannibalReport } from './cannibal.js'

function row(query: string, page: string, impressions: number): GscRow {
  return {
    keys: page ? [query, page] : [query],
    clicks: 10,
    impressions,
    ctr: 10 / impressions,
    position: 5,
  }
}

test('queries bounded page exposure and property demand with a fixed range', async () => {
  const requests: SearchAnalyticsRequest[] = []
  const report = await cannibalReport(
    {
      site: 'sc-domain:example.com',
      days: 28,
      limit: 10,
      minImpressions: 50,
    },
    {
      searchAnalytics: async (_site, request) => {
        requests.push(request)
        const rows = request.dimensions?.includes('page')
          ? [
              row('technical seo audit', 'https://example.com/a', 60),
              row('technical seo audit', 'https://example.com/b', 60),
            ]
          : [row('technical seo audit', '', 100)]
        return { rows, calls: 1, rowsFetched: rows.length }
      },
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  )

  assert.deepEqual(report.range, {
    startDate: '2026-06-08',
    endDate: '2026-07-05',
  })
  assert.equal(requests.length, 2)
  assert.deepEqual(requests[0]?.dimensions, ['query', 'page'])
  assert.equal(requests[0]?.aggregationType, 'auto')
  assert.deepEqual(requests[1]?.dimensions, ['query'])
  assert.equal(requests[1]?.aggregationType, 'byProperty')
  assert.equal(requests[0]?.maxRows, 100_000)
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.verification.technicalStateChecked, false)
  assert.equal(report.summary.eligibleClusters, 1)
  assert.match(report.ledgerSummary, /GSC: 2 calls, 3 rows/)
})

test('reports partial data when a source reaches its retained-row cap', async () => {
  const report = await cannibalReport(
    { site: 'sc-domain:example.com' },
    {
      searchAnalytics: async (_site, request) => ({
        rows: request.dimensions?.includes('page')
          ? [
              row('technical seo audit', 'https://example.com/a', 60),
              row('technical seo audit', 'https://example.com/b', 60),
            ]
          : [row('technical seo audit', '', 100)],
        calls: 4,
        rowsFetched: request.dimensions?.includes('page') ? 100_000 : 1,
      }),
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.source.completeness, 'possibly-truncated')
})

test('excludes malformed source rows and reports partial evidence', async () => {
  const report = await cannibalReport(
    { site: 'sc-domain:example.com' },
    {
      searchAnalytics: async (_site, request) => {
        const rows = request.dimensions?.includes('page')
          ? [
              row('technical seo audit', 'https://example.com/a', 60),
              row('technical seo audit', 'https://example.com/b', 60),
              { ...row('bad row', 'not-a-url', 60), ctr: 2 },
            ]
          : [
              row('technical seo audit', '', 100),
              { ...row('bad property row', '', 100), position: 0 },
            ]
        return { rows, calls: 1, rowsFetched: rows.length }
      },
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.source.completeness, 'partial')
  assert.deepEqual(report.source.pageExposure.validation, {
    retainedRows: 2,
    invalidRows: 1,
  })
  assert.deepEqual(report.source.propertyDemand.validation, {
    retainedRows: 1,
    invalidRows: 1,
  })
  assert.equal(report.summary.eligibleClusters, 1)
  assert.match(report.summary.verdict, /Provider evidence is partial/)
  assert.match(report.caveats.join('\n'), /invalid page-exposure row/)
})

test('does not turn wholly invalid page rows into a filtered all-clear', async () => {
  const report = await cannibalReport(
    { site: 'sc-domain:example.com' },
    {
      searchAnalytics: async (_site, request) => {
        const rows = request.dimensions?.includes('page')
          ? [{ ...row('bad row', 'not-a-url', 60), ctr: 2 }]
          : []
        return { rows, calls: 1, rowsFetched: rows.length }
      },
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.selection.invalidRows, 1)
  assert.equal(report.selection.validRows, 0)
  assert.equal(report.source.completeness, 'partial')
  assert.match(report.summary.verdict, /partial evidence prevents an all-clear/)
  assert.match(report.recommendations.join('\n'), /before treating this result/)
})

test('keeps clean empty and filtered evidence distinct', async () => {
  const dependencies: CannibalDependencies = {
    searchAnalytics: async (_site, request) => {
      const rows = request.dimensions?.includes('page')
        ? [row('single page query', 'https://example.com/only', 100)]
        : [row('single page query', '', 100)]
      return { rows, calls: 1, rowsFetched: rows.length }
    },
    now: () => new Date('2026-07-09T12:00:00.000Z'),
  }
  const filtered = await cannibalReport(
    { site: 'sc-domain:example.com' },
    dependencies,
  )
  const empty = await cannibalReport(
    { site: 'sc-domain:example.com' },
    {
      ...dependencies,
      searchAnalytics: async () => ({ rows: [], calls: 1, rowsFetched: 0 }),
    },
  )

  assert.equal(filtered.dataStatus, 'filtered')
  assert.equal(filtered.source.completeness, 'complete')
  assert.equal(filtered.selection.singlePageQueries, 1)
  assert.equal(empty.dataStatus, 'empty')
  assert.equal(empty.source.completeness, 'complete')
  assert.equal(empty.selection.sourceRows, 0)
})

test('uses an explicit parent report range unchanged', async () => {
  const requests: SearchAnalyticsRequest[] = []
  const report = await cannibalReport(
    {
      site: 'sc-domain:example.com',
      days: 28,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    },
    {
      searchAnalytics: async (_site, request) => {
        requests.push(request)
        return { rows: [], calls: 1, rowsFetched: 0 }
      },
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  )

  assert.equal(report.rangeDays, 90)
  assert.deepEqual(report.range, {
    startDate: '2026-01-01',
    endDate: '2026-03-31',
  })
  assert.ok(
    requests.every(
      (request) =>
        request.startDate === '2026-01-01' && request.endDate === '2026-03-31',
    ),
  )
})

test('rejects invalid options before querying providers', async () => {
  let calls = 0
  await assert.rejects(
    cannibalReport(
      { site: 'sc-domain:example.com', limit: 101 },
      {
        searchAnalytics: async () => {
          calls++
          return { rows: [], calls: 0, rowsFetched: 0 }
        },
        now: () => new Date('2026-07-09T12:00:00.000Z'),
      },
    ),
    /limit must be a whole number between 1 and 100/,
  )
  assert.equal(calls, 0)
})

test('does not hide Search Console provider failures', async () => {
  await assert.rejects(
    cannibalReport(
      { site: 'sc-domain:example.com' },
      {
        searchAnalytics: async () => {
          throw new Error('provider failed')
        },
        now: () => new Date('2026-07-09T12:00:00.000Z'),
      },
    ),
    /provider failed/,
  )
})
