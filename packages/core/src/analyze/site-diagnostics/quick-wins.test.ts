import assert from 'node:assert/strict'
import test from 'node:test'
import { extractPage } from '../../extract/page-extractor.js'
import type { SearchAnalyticsRequest } from '../../gsc/client/types.js'
import type { GscRow, PageFetchResult } from '../../types.js'
import { type QuickWinsDependencies, quickWinsReport } from './quick-wins.js'

const site = 'sc-domain:example.com'

function row(input: {
  query: string
  url: string
  clicks?: number
  impressions?: number
  position?: number
}): GscRow {
  const clicks = input.clicks ?? 0
  const impressions = input.impressions ?? 1000
  return {
    keys: [input.query, input.url],
    clicks,
    impressions,
    ctr: clicks / impressions,
    position: input.position ?? 9,
  }
}

function peers(): GscRow[] {
  return [20, 18, 15, 12, 10].map((clicks, index) =>
    row({
      query: `peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks,
    }),
  )
}

function fetched(
  url: string,
  overrides: Partial<PageFetchResult> = {},
): PageFetchResult {
  return {
    url,
    finalUrl: url,
    status: 200,
    headers: { 'content-type': 'text/html' },
    html: '<html><head><title>SEO guide</title></head><body><h1>SEO guide</h1><main>Technical SEO guide content.</main></body></html>',
    usedJs: false,
    diagnostics: {
      source: 'network',
      cache: 'miss',
      fetched: true,
      rendered: false,
      blocked: false,
      durationMs: 10,
      retries: 0,
      rateLimit: {
        host: 'example.com',
        concurrency: 2,
        intervalCap: 4,
        intervalMs: 1000,
      },
    },
    warnings: [],
    ...overrides,
  }
}

function dependencies(
  rows: GscRow[],
  overrides: Partial<QuickWinsDependencies> = {},
): QuickWinsDependencies {
  return {
    searchAnalytics: async () => ({ rows, calls: 1, rowsFetched: rows.length }),
    fetch: async (url) => fetched(url),
    extract: extractPage,
    now: () => new Date('2026-07-09T12:00:00.000Z'),
    ...overrides,
  }
}

test('queries bounded retained rows and publishes source semantics', async () => {
  let request: SearchAnalyticsRequest | undefined
  const rows = [
    row({ query: 'technical seo audit', url: 'https://example.com/audit' }),
    ...peers(),
  ]
  const report = await quickWinsReport(
    { site },
    dependencies(rows, {
      searchAnalytics: async (_site, body) => {
        request = body
        return { rows, calls: 2, rowsFetched: rows.length }
      },
    }),
  )

  assert.deepEqual(request?.dimensions, ['query', 'page'])
  assert.equal(request?.dataState, 'final')
  assert.equal(request?.maxRows, 100_000)
  assert.equal(request?.startDate, '2026-06-08')
  assert.equal(request?.endDate, '2026-07-05')
  assert.equal(report.source.calls, 2)
  assert.equal(report.source.completeness, 'retained-query-rows-only')
  assert.equal(report.dataStatus, 'available')
  assert.equal(report.verification.requested, false)
  assert.equal(report.items[0]?.priority.estimatedClickLift, false)
  assert.match(report.caveats.join(' '), /not a traffic forecast/)
  assert.match(report.caveats.join(' '), /top retained query rows only/)
})

test('uses an explicit parent date window unchanged', async () => {
  let request: SearchAnalyticsRequest | undefined
  await quickWinsReport(
    { site, startDate: '2026-01-01', endDate: '2026-03-31' },
    dependencies([], {
      searchAnalytics: async (_site, body) => {
        request = body
        return { rows: [], calls: 1, rowsFetched: 0 }
      },
    }),
  )

  assert.equal(request?.startDate, '2026-01-01')
  assert.equal(request?.endDate, '2026-03-31')
})

test('deduplicates page fetches while evaluating each query', async () => {
  let fetches = 0
  const target = 'https://example.com/audit'
  const report = await quickWinsReport(
    { site, verifyLimit: 2 },
    dependencies(
      [
        row({ query: 'technical seo audit', url: target }),
        row({ query: 'seo audit software', url: target }),
        ...peers(),
      ],
      {
        fetch: async (url) => {
          fetches++
          return fetched(url)
        },
      },
    ),
  )

  assert.equal(fetches, 1)
  assert.deepEqual(report.verification, {
    requested: true,
    limit: 2,
    attemptedRows: 2,
    attemptedUrls: 1,
    verified: 2,
    technical: 0,
    failed: 0,
  })
  assert.equal(
    report.items[0]?.contentVerification?.query,
    report.items[0]?.query,
  )
  assert.equal(
    report.items[1]?.contentVerification?.query,
    report.items[1]?.query,
  )
})

test('technical evidence overrides CTR and content-edit advice', async () => {
  const report = await quickWinsReport(
    { site, verifyContent: true, verifyLimit: 1 },
    dependencies(
      [
        row({ query: 'technical seo audit', url: 'https://example.com/audit' }),
        ...peers(),
      ],
      { fetch: async (url) => fetched(url, { status: 404 }) },
    ),
  )
  const item = report.items[0]

  assert.equal(item?.finding, 'technical-check')
  assert.equal(item?.recommendation.confidence, 'medium')
  assert.match(
    item?.recommendation.action ?? '',
    /indexable|canonical|fetchable/,
  )
  assert.doesNotMatch(item?.recommendation.action ?? '', /add.*copy/i)
  assert.equal(report.verification.technical, 1)
})

test('rejects invalid windows before provider calls', async () => {
  let calls = 0
  const deps = dependencies([], {
    searchAnalytics: async () => {
      calls++
      return { rows: [], calls: 1, rowsFetched: 0 }
    },
  })

  await assert.rejects(quickWinsReport({ site, days: 0 }, deps), /Days must be/)
  await assert.rejects(
    quickWinsReport({ site, verifyLimit: -1 }, deps),
    /Verification limit must be/,
  )
  await assert.rejects(
    quickWinsReport({ site, startDate: '2026-02-01' }, deps),
    /provided together/,
  )
  assert.equal(calls, 0)
})

test('does not hide Search Console failures', async () => {
  await assert.rejects(
    quickWinsReport(
      { site },
      dependencies([], {
        searchAnalytics: async () => {
          throw new Error('Search Console unavailable')
        },
      }),
    ),
    /Search Console unavailable/,
  )
})
