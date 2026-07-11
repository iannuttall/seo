import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { crawlSite } from './site-crawl.js'

function aliasedPage(url: string): CrawlPageSnapshot {
  return {
    url,
    finalUrl: url,
    status: 200,
    contentType: 'text/html',
    responseTimeMs: 20,
    title: 'Crawl completeness fixture',
    metaDescription: 'Crawl completeness fixture.',
    h1: 'Crawl completeness fixture',
    h1Count: 1,
    h2Count: 0,
    h3Count: 0,
    indexable: true,
    wordCount: 10,
    contentHash: 'fixture',
    outgoingInternalCount: 0,
    outgoingExternalCount: 0,
    geo: {
      semanticHtml: true,
      structuredData: true,
      hasAuthor: false,
      hasDate: false,
      questionHeadings: 0,
      structuredBlocks: 0,
      answerable: false,
    },
  }
}

test('crawlSite stays partial when queue safety excludes URLs before the page limit', async () => {
  const root = 'https://example.com/'
  const report = await crawlSite(
    {
      url: root,
      useSitemap: false,
      checkExternal: false,
      maxPages: 3,
      maxDepth: 2,
      concurrency: 1,
    },
    {
      fetch: async () =>
        new Response('# llms', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      fetchPage: async (url) => ({
        urls:
          url === root
            ? Array.from(
                { length: 40 },
                (_, index) => `https://example.com/page-${index}`,
              )
            : [],
        page: aliasedPage(root),
      }),
    },
  )

  assert.equal(report.summary.totalPages, 1)
  assert.equal(report.summary.pageLimitReached, false)
  assert.equal(report.status, 'partial')
  assert.match(
    report.caveats.join('\n'),
    /Left 26 eligible same-origin URLs unqueued to keep this crawl bounded/,
  )
})
