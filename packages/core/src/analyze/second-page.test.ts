import assert from 'node:assert/strict'
import test from 'node:test'
import { extractPage } from '../extract/page-extractor.js'
import type { SearchAnalyticsRequest } from '../gsc/client/types.js'
import type { GscRow, PageFetchResult } from '../types/pages.js'
import { type SecondPageDependencies, secondPage } from './second-page.js'

const site = 'sc-domain:example.com'

function row(query: string, page: string, position = 15): GscRow {
  return {
    keys: [query, page],
    clicks: 2,
    impressions: 100,
    ctr: 0.02,
    position,
  }
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
  overrides: Partial<SecondPageDependencies> = {},
): SecondPageDependencies {
  return {
    searchAnalytics: async () => ({ rows, calls: 1, rowsFetched: rows.length }),
    fetch: async (url) => fetched(url),
    extract: extractPage,
    now: () => new Date('2026-07-09T12:00:00.000Z'),
    ...overrides,
  }
}

test('queries complete query/page rows and returns report provenance', async () => {
  let request: SearchAnalyticsRequest | undefined
  const rows = [row('technical seo', 'https://example.com/guide')]
  const report = await secondPage(
    { site },
    dependencies(rows, {
      searchAnalytics: async (_site, body) => {
        request = body
        return { rows, calls: 2, rowsFetched: 1 }
      },
    }),
  )

  assert.deepEqual(request?.dimensions, ['query', 'page'])
  assert.equal(request?.dataState, 'final')
  assert.equal(request?.maxRows, 100_000)
  assert.equal(request?.startDate, '2026-06-08')
  assert.equal(request?.endDate, '2026-07-05')
  assert.equal(report.generatedAt, '2026-07-09T12:00:00.000Z')
  assert.equal(report.source.calls, 2)
  assert.equal(report.dataStatus, 'available')
  assert.equal(report.verification.requested, false)
  assert.equal(report.items[0]?.finding, 'unverified')
})

test('summary grammar matches zero, one, and multiple page counts', async () => {
  const empty = await secondPage({ site }, dependencies([]))
  const singular = await secondPage(
    { site },
    dependencies([row('technical seo', 'https://example.com/guide')]),
  )
  const plural = await secondPage(
    { site },
    dependencies([
      row('technical seo', 'https://example.com/guide'),
      row('seo checklist', 'https://example.com/checklist'),
    ]),
  )

  assert.equal(
    empty.summary.verdict,
    'Google Search Console returned no retained query/page rows for this window.',
  )
  assert.equal(
    singular.summary.verdict,
    '1 eligible average-position page found; 1 page is returned in priority order for investigation.',
  )
  assert.equal(
    plural.summary.verdict,
    '2 eligible average-position pages found; 2 pages are returned in priority order for investigation.',
  )
})

test('does not fetch unless verification is explicitly requested', async () => {
  let fetches = 0
  const report = await secondPage(
    { site },
    dependencies([row('technical seo', 'https://example.com/guide')], {
      fetch: async (url) => {
        fetches++
        return fetched(url)
      },
    }),
  )

  assert.equal(fetches, 0)
  assert.match(report.caveats.join(' '), /verification was not requested/i)
})

test('verifies only the bounded top-N returned pages', async () => {
  let fetches = 0
  const rows = [
    row('alpha', 'https://example.com/a', 11),
    row('beta', 'https://example.com/b', 12),
    row('gamma', 'https://example.com/c', 13),
  ]
  const report = await secondPage(
    { site, verifyLimit: 2 },
    dependencies(rows, {
      fetch: async (url) => {
        fetches++
        return fetched(url)
      },
    }),
  )

  assert.equal(fetches, 2)
  assert.deepEqual(report.verification, {
    requested: true,
    limit: 2,
    attempted: 2,
    verified: 2,
    failed: 0,
    technicalChecks: 0,
  })
  assert.equal(report.items[2]?.contentVerification, undefined)
})

test('technical evidence overrides copy advice', async () => {
  const report = await secondPage(
    { site, verifyContent: true },
    dependencies([row('technical seo', 'https://example.com/guide')], {
      fetch: async (url) => fetched(url, { status: 404 }),
    }),
  )
  const item = report.items[0]

  assert.equal(item?.finding, 'fix-technical')
  assert.equal(item?.contentVerification?.classification, 'technical-check')
  assert.match(
    item?.recommendation.action ?? '',
    /indexable|canonical|fetchable/i,
  )
  assert.doesNotMatch(item?.recommendation.action ?? '', /add.*copy/i)
  assert.equal(report.summary.technicalIssues, 1)
  assert.equal(
    report.summary.verdict,
    '1 eligible average-position page found; 1 returned page has verified technical issues to fix before content changes.',
  )
})

test('keeps other results when one page fetch fails', async () => {
  const rows = [
    row('alpha', 'https://example.com/a', 11),
    row('beta', 'https://example.com/b', 12),
  ]
  const report = await secondPage(
    { site, verifyContent: true, verifyLimit: 2 },
    dependencies(rows, {
      fetch: async (url) => {
        if (url.endsWith('/a')) throw new Error('connection reset')
        return fetched(url)
      },
    }),
  )

  assert.equal(report.items.length, 2)
  assert.equal(report.items[0]?.finding, 'inspect-fetch')
  assert.equal(report.items[1]?.contentVerification?.status, 'verified')
  assert.equal(report.verification.failed, 1)
  assert.equal(report.verification.verified, 1)
  assert.equal(report.summary.fetchFailures, 1)
  assert.equal(report.summary.technicalIssues, 0)
  assert.match(
    report.warnings.map((warning) => warning.message).join(' '),
    /connection reset/,
  )
})

test('rejects invalid report and verification windows before provider calls', async () => {
  let calls = 0
  const deps = dependencies([], {
    searchAnalytics: async () => {
      calls++
      return { rows: [], calls: 1, rowsFetched: 0 }
    },
  })

  await assert.rejects(secondPage({ site, range: 0 }, deps), /Days must be/)
  await assert.rejects(
    secondPage({ site, verifyLimit: 101 }, deps),
    /Verification limit must be/,
  )
  assert.equal(calls, 0)
})

test('does not hide Search Console errors', async () => {
  await assert.rejects(
    secondPage(
      { site },
      dependencies([], {
        searchAnalytics: async () => {
          throw new Error('auth expired')
        },
      }),
    ),
    /auth expired/,
  )
})
