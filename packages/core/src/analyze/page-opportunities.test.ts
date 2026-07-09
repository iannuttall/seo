import assert from 'node:assert/strict'
import test from 'node:test'
import { SeoError } from '../errors.js'
import { extractPage } from '../extract/page-extractor.js'
import type { SearchAnalyticsRequest } from '../gsc/client/types.js'
import type { GscRow, PageFetchResult } from '../types.js'
import { pageOpportunitiesReport } from './page-opportunities.js'

const site = 'sc-domain:example.com'
const url = 'https://example.com/guide'

function row(input: {
  query: string
  page?: string
  clicks?: number
  impressions?: number
  ctr?: number
  position?: number
}): GscRow {
  const clicks = input.clicks ?? 2
  const impressions = input.impressions ?? 100
  return {
    keys: [input.query, input.page ?? url],
    clicks,
    impressions,
    ctr: input.ctr ?? clicks / impressions,
    position: input.position ?? 5,
  }
}

function fetched(overrides: Partial<PageFetchResult> = {}): PageFetchResult {
  return {
    url,
    finalUrl: url,
    status: 200,
    headers: { 'content-type': 'text/html' },
    html: `<!doctype html><html><head>
      <title>Technical SEO guide</title>
      <meta name="description" content="A practical technical SEO guide">
      <link rel="canonical" href="/guide">
      </head><body><h1>Technical SEO guide</h1>
      <main><p>This technical SEO guide explains crawling, indexing, and site quality.</p></main>
      </body></html>`,
    usedJs: false,
    diagnostics: {
      source: 'network',
      cache: 'miss',
      fetched: true,
      rendered: false,
      blocked: false,
      durationMs: 15,
      retries: 0,
      rateLimit: {
        host: 'example.com',
        concurrency: 2,
        intervalCap: 4,
        intervalMs: 1000,
      },
    },
    warnings: ['JavaScript rendering fell back to plain HTML.'],
    ...overrides,
  }
}

function peers(): GscRow[] {
  return Array.from({ length: 5 }, (_, index) =>
    row({
      query: `technical peer ${index}`,
      page: `https://example.com/peer-${index}`,
      clicks: 12,
      impressions: 200,
      ctr: 0.06,
      position: 5,
    }),
  )
}

test('validates and normalizes the target before querying GSC', async () => {
  let calls = 0
  await assert.rejects(
    pageOpportunitiesReport(
      { site, url: 'https://other.example/guide' },
      {
        searchAnalytics: async () => {
          calls++
          return { rows: [], calls: 0, rowsFetched: 0 }
        },
        fetch: async () => fetched(),
        extract: extractPage,
        now: () => new Date('2026-07-09T12:00:00.000Z'),
      },
    ),
    (error) => error instanceof SeoError && error.code === 'INVALID_INPUT',
  )
  assert.equal(calls, 0)
})

test('rejects invalid date windows before querying GSC', async () => {
  let calls = 0
  await assert.rejects(
    pageOpportunitiesReport(
      { site, url, days: 1.5 },
      {
        searchAnalytics: async () => {
          calls++
          return { rows: [], calls: 0, rowsFetched: 0 }
        },
        fetch: async () => fetched(),
        extract: extractPage,
        now: () => new Date('2026-07-09T12:00:00.000Z'),
      },
    ),
    (error) => error instanceof SeoError && error.code === 'INVALID_INPUT',
  )
  assert.equal(calls, 0)
})

test('uses exact-page rows plus an independent capped site benchmark', async () => {
  const requests: SearchAnalyticsRequest[] = []
  let fetches = 0
  const report = await pageOpportunitiesReport(
    { site, url: `${url}#section` },
    {
      searchAnalytics: async (_site, request) => {
        requests.push(request)
        const exact = Boolean(request.dimensionFilterGroups?.length)
        const rows = exact
          ? [row({ query: 'technical seo guide', clicks: 0, ctr: 0 })]
          : peers()
        return { rows, calls: 1, rowsFetched: rows.length }
      },
      fetch: async (target) => {
        fetches++
        return fetched({ url: target, finalUrl: target })
      },
      extract: extractPage,
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  )

  assert.equal(requests.length, 2)
  assert.deepEqual(requests[0]?.dimensions, ['query', 'page'])
  assert.equal(
    requests[0]?.dimensionFilterGroups?.[0]?.filters[0]?.expression,
    url,
  )
  assert.equal(requests[1]?.maxRows, 100_000)
  assert.equal(requests[1]?.dimensionFilterGroups, undefined)
  assert.equal(fetches, 1)
  assert.equal(report.url, url)
  assert.equal(report.generatedAt, '2026-07-09T12:00:00.000Z')
  assert.equal(report.source.targetRowsFetched, 1)
  assert.equal(report.source.targetCalls, 1)
  assert.equal(report.verification.status, 'verified')
  assert.equal(report.benchmark.rowsFetched, 5)
  assert.match(report.items[0]?.benchmark.source ?? '', /^site_gsc/)
  assert.deepEqual(report.warnings, [
    'JavaScript rendering fell back to plain HTML.',
  ])
})

test('skips the site benchmark and page fetch when every row is filtered', async () => {
  let searches = 0
  let fetches = 0
  const report = await pageOpportunitiesReport(
    { site, url, minImpressions: 10 },
    {
      searchAnalytics: async () => {
        searches++
        return {
          rows: [row({ query: 'technical seo guide', impressions: 9 })],
          calls: 1,
          rowsFetched: 1,
        }
      },
      fetch: async () => {
        fetches++
        return fetched()
      },
      extract: extractPage,
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  )

  assert.equal(searches, 1)
  assert.equal(fetches, 0)
  assert.equal(report.dataStatus, 'filtered')
  assert.equal(report.selection.belowMinimumRows, 1)
  assert.equal(report.verification.status, 'skipped')
  assert.match(report.summary.verdict, /none met the report criteria/)
})

test('returns GSC observations without claiming coverage when fetch fails', async () => {
  let searches = 0
  const report = await pageOpportunitiesReport(
    { site, url },
    {
      searchAnalytics: async () => {
        searches++
        const rows =
          searches === 1
            ? [row({ query: 'technical seo guide', position: 14 })]
            : peers()
        return { rows, calls: 1, rowsFetched: rows.length }
      },
      fetch: async () => {
        throw new Error('connection reset')
      },
      extract: extractPage,
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  )

  assert.equal(report.verification.status, 'failed')
  assert.equal(report.items[0]?.opportunityType, 'ranking')
  assert.notEqual(report.items[0]?.opportunityType, 'covered')
  assert.match(report.warnings[0] ?? '', /connection reset/)
})

test('technical HTTP evidence overrides content and CTR advice', async () => {
  let searches = 0
  const report = await pageOpportunitiesReport(
    { site, url },
    {
      searchAnalytics: async () => {
        searches++
        const rows =
          searches === 1
            ? [row({ query: 'technical seo guide', clicks: 0, ctr: 0 })]
            : peers()
        return { rows, calls: 1, rowsFetched: rows.length }
      },
      fetch: async () => fetched({ status: 404 }),
      extract: extractPage,
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  )

  assert.equal(report.page?.status, 404)
  assert.equal(report.items[0]?.opportunityType, 'technical-check')
  assert.deepEqual(report.items[0]?.verification.signals, ['http-non-2xx'])
  assert.equal(report.summary.focus, 'technical-check')
})

test('does not hide Search Console provider errors', async () => {
  await assert.rejects(
    pageOpportunitiesReport(
      { site, url },
      {
        searchAnalytics: async () => {
          throw new SeoError('AUTH_EXPIRED', 'Login expired.')
        },
        fetch: async () => fetched(),
        extract: extractPage,
        now: () => new Date('2026-07-09T12:00:00.000Z'),
      },
    ),
    (error) => error instanceof SeoError && error.code === 'AUTH_EXPIRED',
  )
})
