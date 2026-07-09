import assert from 'node:assert/strict'
import test from 'node:test'
import type { SearchAnalyticsRequest } from '../../gsc/client.js'
import type { GscRow } from '../../types.js'
import {
  type DecayingDependencies,
  type DecayingReportInput,
  decayingReport,
} from './decaying.js'

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

test('uses fixed-clock current and previous-period ranges', async () => {
  const requests: SearchAnalyticsRequest[] = []
  const report = await decayingReport(
    { site, days: 28 },
    emptyDependencies({
      searchAnalytics: async (_site, request) => {
        requests.push(request)
        return { rows: [], calls: 1, rowsFetched: 0 }
      },
    }),
  )

  assert.deepEqual(report.ranges, {
    current: { startDate: '2026-06-08', endDate: '2026-07-05' },
    previous: { startDate: '2026-05-11', endDate: '2026-06-07' },
  })
  assert.equal(report.rangeDays, 28)
  assert.equal(report.comparison, 'previous-period')
  assert.deepEqual(
    requests.map(({ startDate, endDate }) => ({ startDate, endDate })),
    [report.ranges.current, report.ranges.previous],
  )
})

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

test('keeps year-over-year windows the same inclusive length across leap day', async () => {
  const report = await decayingReport(
    {
      site,
      startDate: '2024-02-28',
      endDate: '2024-03-01',
      comparison: 'year-over-year',
    },
    emptyDependencies({
      now: () => new Date('2024-03-06T12:00:00.000Z'),
    }),
  )

  assert.deepEqual(report.ranges.previous, {
    startDate: '2023-02-27',
    endDate: '2023-03-01',
  })
  assert.equal(report.rangeDays, 3)
})

test('requests bounded final query-page rows and forwards refresh', async () => {
  const calls: Array<{
    site: string
    request: SearchAnalyticsRequest
    refresh: boolean | undefined
  }> = []
  const report = await decayingReport(
    { site, refresh: true },
    emptyDependencies({
      searchAnalytics: async (requestedSite, request, options) => {
        calls.push({
          site: requestedSite,
          request,
          refresh: options?.refresh,
        })
        return { rows: [], calls: 2, rowsFetched: 0 }
      },
    }),
  )

  assert.equal(calls.length, 2)
  for (const call of calls) {
    assert.equal(call.site, site)
    assert.deepEqual(call.request.dimensions, ['query', 'page'])
    assert.equal(call.request.aggregationType, 'auto')
    assert.equal(call.request.type, 'web')
    assert.equal(call.request.dataState, 'final')
    assert.equal(call.request.maxRows, 100_000)
    assert.equal(call.refresh, true)
  }
  assert.match(report.ledgerSummary, /GSC: 4 calls, 0 rows/)
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

test('propagates Search Console provider errors', async () => {
  await assert.rejects(
    decayingReport(
      { site },
      emptyDependencies({
        searchAnalytics: async () => {
          throw new Error('Search Console unavailable')
        },
      }),
    ),
    /Search Console unavailable/,
  )
})

test('rejects invalid options before calling Search Console', async () => {
  let calls = 0
  const dependencies = emptyDependencies({
    searchAnalytics: async () => {
      calls++
      return { rows: [], calls: 1, rowsFetched: 0 }
    },
  })
  const invalidInputs: DecayingReportInput[] = [
    { site, days: 0 },
    { site, limit: 101 },
    { site, minDropPct: 101 },
    { site, minPreviousClicks: -1 },
    { site, minClickLoss: Number.NaN },
    { site, startDate: '2026-01-01' },
    { site, comparison: 'weekly' as never },
    { site, brandTerms: Array.from({ length: 21 }, () => 'brand') },
    { site, brandTerms: [''] },
    { site, days: 243 },
    { site, days: 122, comparison: 'year-over-year' },
    { site, startDate: '2026-07-01', endDate: '2026-07-06' },
  ]

  for (const input of invalidInputs) {
    await assert.rejects(decayingReport(input, dependencies))
  }
  assert.equal(calls, 0)
})
