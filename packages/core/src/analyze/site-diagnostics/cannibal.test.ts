import assert from 'node:assert/strict'
import { test } from 'node:test'
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
