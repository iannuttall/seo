import assert from 'node:assert/strict'
import test from 'node:test'
import type { SearchAnalyticsRequest } from '../../gsc/client.js'
import type { GscRow } from '../../types.js'
import { type DecayingDependencies, decayingReport } from './decaying.js'

const site = 'sc-domain:example.com'
const now = () => new Date('2026-07-09T12:00:00.000Z')

function row(
  query: string,
  url: string,
  clicks: number,
  impressions = 100,
): GscRow {
  return {
    keys: [query, url],
    clicks,
    impressions,
    ctr: clicks / impressions,
    position: 8,
  }
}

function emptyDependencies(
  overrides: Partial<DecayingDependencies> = {},
): DecayingDependencies {
  return {
    searchAnalytics: async () => ({ rows: [], calls: 1, rowsFetched: 0 }),
    now,
    ...overrides,
  }
}

test('uses the Search Console Pacific calendar at the UTC date boundary', async () => {
  const report = await decayingReport(
    { site, days: 1 },
    emptyDependencies({
      now: () => new Date('2026-07-09T02:00:00.000Z'),
    }),
  )

  assert.deepEqual(report.ranges.current, {
    startDate: '2026-07-04',
    endDate: '2026-07-04',
  })
})

test('clamps leap day when comparing year over year', async () => {
  const requests: SearchAnalyticsRequest[] = []
  const report = await decayingReport(
    {
      site,
      startDate: '2024-02-29',
      endDate: '2024-03-01',
      comparison: 'year-over-year',
    },
    emptyDependencies({
      now: () => new Date('2024-03-06T12:00:00.000Z'),
      searchAnalytics: async (_site, request) => {
        requests.push(request)
        return { rows: [], calls: 1, rowsFetched: 0 }
      },
    }),
  )

  assert.deepEqual(report.ranges, {
    current: { startDate: '2024-02-29', endDate: '2024-03-01' },
    previous: { startDate: '2023-02-28', endDate: '2023-03-01' },
  })
  assert.equal(report.rangeDays, 2)
  assert.equal(report.comparison, 'year-over-year')
  assert.deepEqual(
    requests.map(({ startDate, endDate }) => ({ startDate, endDate })),
    [report.ranges.current, report.ranges.previous],
  )
})

test('returns a complete report with explicit retained-row provenance', async () => {
  const previous = row(
    'technical seo audit',
    'https://example.com/technical-seo',
    10,
  )
  const current = row(
    'technical seo audit',
    'https://example.com/technical-seo',
    2,
    40,
  )
  const report = await decayingReport(
    { site, includeBrand: true },
    emptyDependencies({
      searchAnalytics: async (_site, request) => {
        const rows = request.endDate === '2026-07-05' ? [current] : [previous]
        return { rows, calls: 1, rowsFetched: rows.length }
      },
    }),
  )

  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.source.aggregationType, 'auto')
  assert.equal(report.source.completeness, 'retained-query-rows-only')
  assert.equal(report.methodology.gscHistoryMonths, 16)
  assert.equal(report.items.length, 1)
  assert.equal(report.summary.observedRetainedQueryClickLoss, 8)
})

test('marks a capped provider response as possibly truncated', async () => {
  const previous = row(
    'technical seo audit',
    'https://example.com/technical-seo',
    10,
  )
  const current = row(
    'technical seo audit',
    'https://example.com/technical-seo',
    2,
  )
  const report = await decayingReport(
    { site, includeBrand: true },
    emptyDependencies({
      searchAnalytics: async (_site, request) => ({
        rows: request.endDate === '2026-07-05' ? [current] : [previous],
        calls: 1,
        rowsFetched: 100_000,
      }),
    }),
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.source.completeness, 'possibly-truncated')
  assert.equal(report.source.current.possiblyTruncated, true)
  assert.equal(report.source.previous.possiblyTruncated, true)
  assert.match(report.warnings.join(' '), /may be truncated/i)
})

test('does not infer losses when the current retained window is empty', async () => {
  const previous = [
    row('technical seo audit', 'https://example.com/technical-seo', 25),
  ]
  const report = await decayingReport(
    { site, includeBrand: true },
    emptyDependencies({
      searchAnalytics: async (_site, request) => {
        const rows = request.endDate === '2026-06-07' ? previous : []
        return { rows, calls: 1, rowsFetched: rows.length }
      },
    }),
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.selection.currentAggregatedRows, 0)
  assert.equal(report.selection.currentRowNotRetained, 1)
  assert.equal(report.selection.eligibleRows, 0)
  assert.deepEqual(report.items, [])
  assert.equal(report.summary.observedRetainedQueryClickLoss, 0)
  assert.match(report.summary.verdict, /no query\/page losses were inferred/i)
  assert.equal(report.methodology.missingRowsTreatedAsZero, false)
})

test('reports a partial comparison when the previous window is empty', async () => {
  const current = [
    row('technical seo audit', 'https://example.com/technical-seo', 25),
  ]
  const report = await decayingReport(
    { site, includeBrand: true },
    emptyDependencies({
      searchAnalytics: async (_site, request) => {
        const rows = request.endDate === '2026-07-05' ? current : []
        return { rows, calls: 1, rowsFetched: rows.length }
      },
    }),
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.selection.previousAggregatedRows, 0)
  assert.equal(report.selection.eligibleRows, 0)
  assert.match(report.summary.verdict, /could not be measured/i)
  assert.match(report.warnings.join(' '), /comparison window returned no/i)
})

test('marks malformed provider rows as partial evidence', async () => {
  const invalid = row(
    'technical seo audit',
    'https://example.com/technical-seo',
    25,
  )
  invalid.position = Number.NaN
  const report = await decayingReport(
    { site, includeBrand: true },
    emptyDependencies({
      searchAnalytics: async () => ({
        rows: [invalid],
        calls: 1,
        rowsFetched: 1,
      }),
    }),
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.selection.currentInvalidRows, 1)
  assert.equal(report.selection.previousInvalidRows, 1)
  assert.match(report.warnings.join(' '), /invalid dimensions or metrics/i)
})
