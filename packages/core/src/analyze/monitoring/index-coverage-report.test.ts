import assert from 'node:assert/strict'
import test from 'node:test'
import { createCrawlReport } from '../crawler/report.js'
import {
  type IndexCoverageReportDependencies,
  indexCoverageSignals,
} from './index-coverage-report.js'

function crawl() {
  return createCrawlReport({
    id: 'crawl_saved',
    site: 'sc-domain:example.com',
    generatedAt: '2026-07-01T09:00:00.000Z',
    config: { url: 'https://example.com/', maxPages: 500 },
    pages: [
      {
        url: 'https://example.com/visible',
        finalUrl: 'https://example.com/visible',
        status: 200,
        indexable: true,
        declaredIndexability: 'indexable-candidate',
        wordCount: 100,
        contentHash: 'visible',
        outgoingInternalCount: 0,
      },
      {
        url: 'https://example.com/review',
        finalUrl: 'https://example.com/review',
        status: 200,
        indexable: true,
        declaredIndexability: 'indexable-candidate',
        wordCount: 100,
        contentHash: 'review',
        outgoingInternalCount: 0,
      },
    ],
    ai: {
      robotsTxt: {
        url: 'https://example.com/robots.txt',
        exists: true,
        availability: 'available',
        status: 200,
        sitemapUrls: ['https://example.com/sitemap.xml'],
        botAccess: [],
      },
    },
  })
}

function dependencies(
  overrides: Partial<IndexCoverageReportDependencies> = {},
): IndexCoverageReportDependencies {
  const report = crawl()
  return {
    loadCrawl: () => report,
    latestCrawl: () => report,
    searchAnalytics: async (_site, _request) => ({
      rows: [
        {
          keys: ['https://example.com/visible'],
          clicks: 2,
          impressions: 20,
          ctr: 0.1,
          position: 4,
        },
      ],
      calls: 1,
      rowsFetched: 1,
    }),
    fetchSitemap: async ({ sitemapUrl, limit = 50_000 }) => ({
      sitemapUrl,
      dataStatus: 'complete',
      urls: [
        'https://example.com/visible',
        'https://example.com/review',
        'https://example.com/sitemap-only',
      ],
      nestedSitemaps: [],
      source: {
        sitemapsFetched: 1,
        urlLocs: 3,
        sitemapLocs: 0,
        duplicateUrlLocs: 0,
        duplicateSitemapLocs: 0,
        invalidLocs: { count: 0, samples: [] },
        documents: [],
      },
      truncation: {
        possiblyTruncated: false,
        urlLimitExceeded: false,
        nestedSitemapLimitExceeded: false,
        omittedUrlsAtLeast: 0,
        unprocessedSitemaps: 0,
        limits: { urls: limit, sitemaps: 50 },
      },
      warnings: [],
    }),
    now: () => new Date('2026-07-10T09:00:00.000Z'),
    ...overrides,
  }
}

test('compares the latest saved crawl with finalized page visibility and declared sitemaps', async () => {
  let searchRequest: Record<string, unknown> | undefined
  const report = await indexCoverageSignals(
    {
      site: 'sc-domain:example.com',
      days: 28,
      rowLimit: 25_000,
    },
    dependencies({
      searchAnalytics: async (_site, request) => {
        searchRequest = request as unknown as Record<string, unknown>
        return {
          rows: [
            {
              keys: ['https://example.com/visible'],
              clicks: 2,
              impressions: 20,
              ctr: 0.1,
              position: 4,
            },
          ],
          calls: 1,
          rowsFetched: 1,
        }
      },
    }),
  )

  assert.deepEqual(searchRequest, {
    startDate: '2026-06-09',
    endDate: '2026-07-06',
    dimensions: ['page'],
    type: 'web',
    dataState: 'final',
    maxRows: 25_000,
  })
  assert.equal(report.input.crawlReport.id, 'crawl_saved')
  assert.equal(report.input.sitemapDocuments.source, 'crawl-robots')
  assert.equal(report.summary.retainedSearchVisibleUrls, 1)
  assert.equal(
    report.summary.crawlableCandidatesWithoutRetainedSearchVisibility,
    1,
  )
  assert.equal(report.summary.sitemapOnlyUrls, 1)
  assert.match(report.caveats.join('\n'), /not proven unindexed/i)
})

test('keeps sitemap inventory unavailable when a saved crawl has no sitemap source', async () => {
  const reportWithoutSitemap = createCrawlReport({
    id: 'crawl_no_sitemap',
    site: 'sc-domain:example.com',
    config: { url: 'https://example.com/' },
    pages: [],
  })
  let sitemapCalls = 0
  const report = await indexCoverageSignals(
    { site: 'sc-domain:example.com' },
    dependencies({
      latestCrawl: () => reportWithoutSitemap,
      fetchSitemap: async () => {
        sitemapCalls += 1
        throw new Error('unexpected sitemap fetch')
      },
    }),
  )

  assert.equal(sitemapCalls, 0)
  assert.equal(report.sources.sitemap.completeness, 'unavailable')
  assert.equal(report.input.sitemapDocuments.source, 'unavailable')
  assert.match(report.caveats.join('\n'), /No sitemap inventory was supplied/)
})

test('rejects a saved crawl from a different Search Console property', async () => {
  await assert.rejects(
    indexCoverageSignals(
      {
        site: 'sc-domain:other.example',
        crawlReportId: 'crawl_saved',
      },
      dependencies(),
    ),
    /belongs to sc-domain:example\.com/,
  )
})
