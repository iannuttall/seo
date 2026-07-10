import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { crawlSite } from './site-crawl.js'
import {
  crawlMetricsWindow,
  joinSearchMetrics,
} from './site-crawl-providers.js'

function crawlPageSnapshot(
  url: string,
  input: Partial<CrawlPageSnapshot> = {},
): CrawlPageSnapshot {
  return {
    url,
    finalUrl: url,
    status: 200,
    contentType: 'text/html',
    responseTimeMs: 20,
    title: 'Sparse data fixture page',
    metaDescription: 'Sparse data fixture page description.',
    h1: 'Sparse data fixture page',
    h1Count: 1,
    h2Count: 1,
    h3Count: 0,
    indexable: true,
    wordCount: 180,
    contentHash: `hash-${url}`,
    outgoingInternalCount: 0,
    outgoingExternalCount: 0,
    geo: {
      semanticHtml: true,
      structuredData: true,
      hasAuthor: true,
      hasDate: true,
      questionHeadings: 1,
      structuredBlocks: 1,
      answerable: true,
    },
    ...input,
  }
}

test('crawl provider window uses the Search Console Pacific calendar', () => {
  assert.deepEqual(crawlMetricsWindow(new Date('2026-07-09T02:00:00.000Z')), {
    startDate: '2026-06-07',
    endDate: '2026-07-04',
    days: 28,
  })
})

test('crawl provider limits reject unsafe values before provider calls', async () => {
  let fetchCalls = 0
  await assert.rejects(
    crawlSite(
      {
        url: 'https://example.com/',
        analyticsLimit: 0,
      },
      {
        fetchPage: async () => {
          fetchCalls += 1
          throw new Error('should not run')
        },
      },
    ),
    /analyticsLimit must be a positive whole number/,
  )
  assert.equal(fetchCalls, 0)
})

test('capped GSC joins select pages independently of crawl completion order', async () => {
  const requested: string[][] = []
  const pages = [
    crawlPageSnapshot('https://example.com/b'),
    crawlPageSnapshot('https://example.com/'),
    crawlPageSnapshot('https://example.com/a'),
  ]
  await joinSearchMetrics({
    site: 'sc-domain:example.com',
    pages,
    warnings: [],
    limit: 2,
    window: {
      startDate: '2026-06-07',
      endDate: '2026-07-04',
      days: 28,
    },
    queryPageMetrics: async () => undefined,
    queryPageTopQuery: async () => undefined,
    queryPagesMetricsBatch: async (_site, pageUrls) => {
      requested.push(pageUrls)
      return {
        values: new Map(),
        returnedRows: 0,
        retainedRowLimit: 25_000,
        retainedRowLimitReached: false,
      }
    },
    queryPagesTopQueriesBatch: async (_site, pageUrls) => {
      requested.push(pageUrls)
      return {
        values: new Map(),
        returnedRows: 0,
        retainedRowLimit: 25_000,
        retainedRowLimitReached: false,
      }
    },
  })

  assert.deepEqual(requested, [
    ['https://example.com/', 'https://example.com/a'],
    ['https://example.com/', 'https://example.com/a'],
  ])
})

test('GSC joins preserve successful evidence when one bulk provider fails', async () => {
  const url = 'https://example.com/'
  const pages = [crawlPageSnapshot(url)]
  const warnings: string[] = []
  const source = await joinSearchMetrics({
    site: 'sc-domain:example.com',
    pages,
    warnings,
    limit: 10,
    window: {
      startDate: '2026-06-07',
      endDate: '2026-07-04',
      days: 28,
    },
    queryPageMetrics: async () => undefined,
    queryPageTopQuery: async () => undefined,
    queryPagesMetricsBatch: async () => ({
      values: new Map([
        [url, { clicks: 3, impressions: 60, ctr: 0.05, position: 7 }],
      ]),
      returnedRows: 1,
      retainedRowLimit: 25_000,
      retainedRowLimitReached: false,
    }),
    queryPagesTopQueriesBatch: async () => {
      throw new Error('query provider timed out')
    },
  })

  assert.equal(source.status, 'partial')
  assert.equal(source.joinedMetricPages, 1)
  assert.equal(source.joinedQueryPages, 0)
  assert.equal(source.metricRowsReturned, 1)
  assert.deepEqual(pages[0]?.searchMetrics, {
    clicks: 3,
    impressions: 60,
    ctr: 0.05,
    position: 7,
  })
  assert.equal(pages[0]?.topQuery, undefined)
  assert.match(warnings.join('\n'), /top queries failed/)
})

test('crawlSite contains a throwing custom GA4 adapter', async () => {
  const report = await crawlSite(
    {
      url: 'https://example.com/',
      ga4PropertyId: 'properties/123',
      useSitemap: false,
      checkExternal: false,
      maxPages: 1,
    },
    {
      fetch: async () => new Response('missing', { status: 404 }),
      fetchPage: async (url) => ({
        urls: [],
        page: crawlPageSnapshot(url),
      }),
      fetchLandingPageValues: async () => {
        throw new Error('hosted adapter failed')
      },
    },
  )

  assert.equal(report.status, 'partial')
  assert.equal(report.dataSources?.analytics.status, 'unavailable')
  assert.equal(report.dataSources?.analytics.joinedPages, 0)
  assert.match(report.warnings.join('\n'), /GA4 metrics unavailable/)
  assert.match(report.warnings.join('\n'), /hosted adapter failed/)
})

test('crawlSite reports sparse GSC and missing GA4 joins', async () => {
  const calls = {
    searchMetrics: [] as string[],
    topQueries: [] as string[],
    searchWindows: [] as unknown[],
    analytics: [] as Array<{
      startDate: string
      endDate: string
      limit?: number
    }>,
  }

  const report = await crawlSite(
    {
      url: 'https://example.com/',
      site: 'sc-domain:example.com',
      ga4PropertyId: 'properties/123',
      useSitemap: false,
      checkExternal: false,
      maxPages: 3,
      concurrency: 1,
    },
    {
      fetch: async () =>
        new Response('# llms', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      fetchPage: async (url) => {
        const urls =
          url === 'https://example.com/'
            ? ['https://example.com/a', 'https://example.com/b']
            : []
        return {
          urls,
          page: crawlPageSnapshot(url, {
            outgoingInternalCount: urls.length,
            sampleInternalLinks: urls,
          }),
        }
      },
      queryPageMetrics: async (_site, pageUrl, range) => {
        calls.searchMetrics.push(pageUrl)
        calls.searchWindows.push(range)
        if (pageUrl !== 'https://example.com/') return undefined
        return {
          clicks: 4,
          impressions: 120,
          ctr: 0.033,
          position: 8,
        }
      },
      queryPageTopQuery: async (_site, pageUrl, range) => {
        calls.topQueries.push(pageUrl)
        calls.searchWindows.push(range)
        return undefined
      },
      fetchLandingPageValues: async (input) => {
        calls.analytics.push(input)
        return { values: new Map() }
      },
      landingValueForUrl: () => undefined,
      now: () => new Date('2026-06-19T00:00:00.000Z'),
    },
  )

  assert.equal(report.status, 'partial')
  assert.deepEqual(calls.searchMetrics, [
    'https://example.com/',
    'https://example.com/a',
    'https://example.com/b',
  ])
  assert.deepEqual(calls.topQueries, calls.searchMetrics)
  assert.equal(calls.analytics.length, 1)
  assert.deepEqual(calls.analytics[0], {
    propertyId: 'properties/123',
    startDate: '2026-05-18',
    endDate: '2026-06-14',
    limit: 5000,
  })
  assert.deepEqual(
    [...new Set(calls.searchWindows.map((range) => JSON.stringify(range)))],
    ['28'],
  )
  assert.deepEqual(report.pages[0]?.searchMetrics, {
    clicks: 4,
    impressions: 120,
    ctr: 0.033,
    position: 8,
  })
  assert.equal(report.pages[1]?.searchMetrics, undefined)
  assert.equal(report.pages[2]?.searchMetrics, undefined)
  assert.equal(report.pages[0]?.analytics, undefined)
  assert.match(report.warnings.join('\n'), /GSC metrics joined for 1 of 3/)
  assert.match(report.warnings.join('\n'), /GA4 metrics joined for 0/)
  assert.equal(report.dataSources?.searchConsole.status, 'partial')
  assert.equal(report.dataSources?.searchConsole.joinedMetricPages, 1)
  assert.equal(report.dataSources?.searchConsole.joinedQueryPages, 0)
  assert.equal(report.dataSources?.analytics.status, 'partial')
  assert.equal(report.dataSources?.searchConsole.window, undefined)
  assert.match(report.warnings.join('\n'), /exact queried dates/)
})

test('crawlSite marks capped provider evidence partial instead of zero', async () => {
  const gscWindows: unknown[] = []
  const report = await crawlSite(
    {
      url: 'https://example.com/',
      site: 'sc-domain:example.com',
      ga4PropertyId: 'properties/123',
      useSitemap: false,
      checkExternal: false,
      maxPages: 10,
      analyticsLimit: 1,
    },
    {
      fetch: async () => new Response('missing', { status: 404 }),
      fetchPage: async (url) => ({
        urls: [],
        page: crawlPageSnapshot(url),
      }),
      queryPagesMetricsBatch: async (_site, _pageUrls, window) => {
        gscWindows.push(window)
        return {
          values: new Map(),
          returnedRows: 25_000,
          retainedRowLimit: 25_000,
          retainedRowLimitReached: true,
        }
      },
      queryPagesTopQueriesBatch: async (_site, _pageUrls, window) => {
        gscWindows.push(window)
        return {
          values: new Map(),
          returnedRows: 25_000,
          retainedRowLimit: 25_000,
          retainedRowLimitReached: true,
        }
      },
      fetchLandingPageValues: async () => ({
        values: new Map(),
        source: {
          returnedRows: 1,
          availableRows: 10,
          retainedRowLimit: 1,
          retainedRowLimitReached: true,
        },
      }),
      landingValueForUrl: () => undefined,
      now: () => new Date('2026-06-19T00:00:00.000Z'),
    },
  )

  assert.equal(report.status, 'partial')
  assert.deepEqual(gscWindows, [
    { startDate: '2026-05-18', endDate: '2026-06-14' },
    { startDate: '2026-05-18', endDate: '2026-06-14' },
  ])
  assert.deepEqual(report.dataSources?.searchConsole.window, {
    startDate: '2026-05-18',
    endDate: '2026-06-14',
    days: 28,
  })
  assert.equal(report.dataSources?.searchConsole.status, 'partial')
  assert.equal(report.dataSources?.searchConsole.retainedRowLimitReached, true)
  assert.equal(report.dataSources?.searchConsole.metricRowsReturned, 25_000)
  assert.equal(report.dataSources?.analytics.status, 'partial')
  assert.equal(report.dataSources?.analytics.availableRows, 10)
  assert.equal(report.dataSources?.analytics.returnedRows, 1)
  assert.match(report.warnings.join('\n'), /not reliable zero-visibility/)
  assert.match(report.warnings.join('\n'), /not reliable zero-traffic/)
})

test('an injected GSC batch never mixes with default providers', async () => {
  let batchCalls = 0
  const report = await crawlSite(
    {
      url: 'https://example.com/',
      site: 'sc-domain:example.com',
      useSitemap: false,
      checkExternal: false,
      maxPages: 1,
    },
    {
      fetch: async () => new Response('missing', { status: 404 }),
      fetchPage: async (url) => ({
        urls: [],
        page: crawlPageSnapshot(url),
      }),
      queryPagesMetricsBatch: async (_site, pageUrls) => {
        batchCalls += 1
        return {
          values: new Map([
            [
              pageUrls[0] ?? '',
              { clicks: 1, impressions: 10, ctr: 0.1, position: 4 },
            ],
          ]),
          returnedRows: 1,
          retainedRowLimit: 25_000,
          retainedRowLimitReached: false,
        }
      },
    },
  )

  assert.equal(batchCalls, 1)
  assert.equal(report.dataSources?.searchConsole.status, 'partial')
  assert.equal(report.dataSources?.searchConsole.joinedMetricPages, 1)
  assert.equal(report.dataSources?.searchConsole.joinedQueryPages, 0)
  assert.match(report.warnings.join('\n'), /did not supply both/)
})

test('crawlSite bulk joins GSC metrics beyond the old first-page window', async () => {
  const childUrls = Array.from(
    { length: 29 },
    (_, index) => `https://example.com/page-${index + 1}`,
  )
  const calls = {
    metrics: [] as string[][],
    topQueries: [] as string[][],
    perPageMetrics: 0,
    perPageTopQueries: 0,
  }

  const report = await crawlSite(
    {
      url: 'https://example.com/',
      site: 'sc-domain:example.com',
      useSitemap: false,
      checkExternal: false,
      maxPages: 30,
      concurrency: 4,
    },
    {
      fetch: async () =>
        new Response('# llms', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      fetchPage: async (url) => {
        const urls = url === 'https://example.com/' ? childUrls : []
        return {
          urls,
          page: crawlPageSnapshot(url, {
            outgoingInternalCount: urls.length,
            sampleInternalLinks: urls,
          }),
        }
      },
      queryPagesMetrics: async (_site, pageUrls) => {
        calls.metrics.push(pageUrls)
        return new Map(
          pageUrls.map((pageUrl, index) => [
            pageUrl,
            {
              clicks: index + 1,
              impressions: (index + 1) * 10,
              ctr: 0.1,
              position: index + 2,
            },
          ]),
        )
      },
      queryPagesTopQueries: async (_site, pageUrls) => {
        calls.topQueries.push(pageUrls)
        return new Map(
          pageUrls.map((pageUrl, index) => [
            pageUrl,
            {
              query: `query ${index + 1}`,
              clicks: index + 1,
              impressions: (index + 1) * 10,
              ctr: 0.1,
              position: index + 2,
            },
          ]),
        )
      },
      queryPageMetrics: async () => {
        calls.perPageMetrics += 1
        return undefined
      },
      queryPageTopQuery: async () => {
        calls.perPageTopQueries += 1
        return undefined
      },
    },
  )

  assert.equal(report.summary.totalPages, 30)
  assert.equal(calls.metrics.length, 1)
  assert.equal(calls.topQueries.length, 1)
  assert.equal(calls.metrics[0]?.length, 30)
  assert.equal(calls.topQueries[0]?.length, 30)
  assert.equal(calls.perPageMetrics, 0)
  assert.equal(calls.perPageTopQueries, 0)
  assert.equal(report.pages[29]?.searchMetrics?.clicks, 30)
  assert.equal(report.pages[29]?.topQuery?.query, 'query 30')
  assert.equal(
    report.warnings.some((warning) => warning.includes('GSC metrics joined')),
    false,
  )
  assert.equal(report.dataSources?.searchConsole.status, 'partial')
  assert.equal(
    report.dataSources?.searchConsole.retainedRowLimitReached,
    undefined,
  )
  assert.equal(report.dataSources?.searchConsole.metricRowsReturned, undefined)
  assert.match(report.warnings.join('\n'), /did not expose retained-row/)
})
