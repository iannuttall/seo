import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
import type { CrawlSiteDependencies } from '../crawler/site-crawl.js'
import { crawlImplementationQueueWorkflow } from './crawl-implementation-queue.js'

test('crawlImplementationQueueWorkflow crawls, joins providers, and ranks fixes', async () => {
  const calls = {
    searchMetrics: [] as string[],
    topQueries: [] as string[],
    analytics: 0,
  }
  const pageUrl = 'https://example.com/'
  const dependencies: CrawlSiteDependencies = {
    fetch: async () =>
      new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      }),
    fetchSitemapUrls: async (input) => ({
      sitemapUrl: input.sitemapUrl,
      urls: [],
      nestedSitemaps: [],
      warnings: [],
    }),
    fetchPage: async (url) => ({
      urls: [],
      page: {
        url,
        finalUrl: url,
        status: 200,
        contentType: 'text/html',
        responseTimeMs: 80,
        sizeBytes: 2000,
        metaDescription:
          'A useful page description with enough detail for search results.',
        h1: 'Example service',
        h1Count: 1,
        h2Count: 1,
        h3Count: 0,
        indexable: true,
        wordCount: 220,
        contentHash: 'queue-page-hash',
        mainContentHash: 'queue-page-main-hash',
        textRatio: 0.35,
        lang: 'en',
        hasViewport: true,
        isHttps: true,
        hasHsts: true,
        outgoingInternalCount: 0,
        outgoingExternalCount: 0,
        schemaTypes: ['Article'],
        openGraphTitle: 'Example service',
        openGraphDescription: 'Example service overview.',
        openGraphImage: 'https://example.com/og.jpg',
        twitterCard: 'summary_large_image',
        author: 'Example Team',
        hasDate: true,
        geo: {
          semanticHtml: true,
          structuredData: true,
          hasAuthor: true,
          hasDate: true,
          questionHeadings: 1,
          structuredBlocks: 2,
          answerable: true,
        },
      },
    }),
    queryPageMetrics: async (_site, url) => {
      calls.searchMetrics.push(url)
      return {
        clicks: 7,
        impressions: 350,
        ctr: 0.02,
        position: 6,
      }
    },
    queryPageTopQuery: async (_site, url) => {
      calls.topQueries.push(url)
      return {
        query: 'example service',
        clicks: 4,
        impressions: 200,
        ctr: 0.02,
        position: 5.5,
      }
    },
    fetchLandingPageValues: async () => {
      calls.analytics += 1
      return {
        values: new Map([
          [
            pageUrl,
            {
              sessions: 25,
              totalUsers: 18,
              conversions: 2,
            },
          ],
        ]),
      }
    },
    landingValueForUrl: (values, url) => values.get(url),
    now: () => new Date('2026-06-19T00:00:00.000Z'),
  }

  const report = await crawlImplementationQueueWorkflow(
    {
      url: pageUrl,
      site: 'sc-domain:example.com',
      ga4PropertyId: 'properties/123',
      useSitemap: false,
      checkExternal: false,
      maxPages: 1,
      limit: 10,
    },
    dependencies,
  )

  const titleItem = report.output.queue.find(
    (item) => item.ruleId === 'missing_title',
  )

  assert.equal(report.workflow, 'crawl-implementation-queue')
  assert.equal(report.site, 'sc-domain:example.com')
  assert.equal(report.output.crawl.summary.totalPages, 1)
  assert.deepEqual(calls.searchMetrics, [pageUrl])
  assert.deepEqual(calls.topQueries, [pageUrl])
  assert.equal(calls.analytics, 1)
  assert.deepEqual(
    report.steps.map((step) => step.status),
    ['completed', 'completed', 'completed', 'completed'],
  )
  assert.ok(titleItem)
  assert.equal(titleItem.source, 'crawl')
  assert.equal(titleItem.category, 'content')
  assert.equal(titleItem.severity, 'high')
  assert.equal(titleItem.affectedUrls, 1)
  assert.deepEqual(titleItem.analytics, { sessions: 25, totalUsers: 18 })
  assert.match(titleItem.evidence, /GSC visibility/)
  assert.match(titleItem.evidence, /GA4 adds 25 sessions/)
  assert.match(
    titleItem.verification.command,
    /^seo crawl https:\/\/example\.com\//,
  )
  assert.deepEqual(report.output.crawl.pages[0]?.searchMetrics, {
    clicks: 7,
    impressions: 350,
    ctr: 0.02,
    position: 6,
  })
  assert.deepEqual(report.output.crawl.pages[0]?.analytics, {
    sessions: 25,
    totalUsers: 18,
    conversions: 2,
  })
})
