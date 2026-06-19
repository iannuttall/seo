import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { crawlSite } from './site-crawl.js'

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

test('crawlSite reports sparse GSC and missing GA4 joins', async () => {
  const calls = {
    searchMetrics: [] as string[],
    topQueries: [] as string[],
    analytics: 0,
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
      queryPageMetrics: async (_site, pageUrl) => {
        calls.searchMetrics.push(pageUrl)
        if (pageUrl !== 'https://example.com/') return undefined
        return {
          clicks: 4,
          impressions: 120,
          ctr: 0.033,
          position: 8,
        }
      },
      queryPageTopQuery: async (_site, pageUrl) => {
        calls.topQueries.push(pageUrl)
        return undefined
      },
      fetchLandingPageValues: async () => {
        calls.analytics += 1
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
  assert.equal(calls.analytics, 1)
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
})
