import assert from 'node:assert/strict'
import test from 'node:test'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { affectedUrls } from './affected-urls.js'
import { createCrawlReport } from './report.js'

test('affectedUrls slices issues by rule and ranks visible pages first', () => {
  const pages = [
    page('https://example.com/a', 10, 100),
    page('https://example.com/b', 100, 1000),
  ]
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages,
    issues: [
      {
        ruleId: 'missing_title',
        title: 'Missing title',
        category: 'metadata',
        severity: 'high',
        url: 'https://example.com/a',
      },
      {
        ruleId: 'missing_title',
        title: 'Missing title',
        category: 'metadata',
        severity: 'high',
        url: 'https://example.com/b',
      },
      {
        ruleId: 'missing_meta_description',
        title: 'Missing meta description',
        category: 'metadata',
        severity: 'medium',
        url: 'https://example.com/b',
      },
    ],
  })

  const urls = affectedUrls(report, { ruleId: 'missing_title' })
  assert.deepEqual(
    urls.map((item) => item.url),
    ['https://example.com/b', 'https://example.com/a'],
  )
  assert.equal(urls[0]?.clicks, 100)
})

function page(
  url: string,
  clicks: number,
  impressions: number,
): CrawlPageSnapshot {
  return {
    url,
    finalUrl: url,
    status: 200,
    responseTimeMs: 10,
    sizeBytes: 1000,
    usedJs: false,
    fetchSource: 'network',
    cacheState: 'miss',
    blocked: false,
    h1Count: 1,
    h2Count: 0,
    h3Count: 0,
    indexable: true,
    wordCount: 100,
    contentHash: 'hash',
    imagesTotal: 0,
    imagesMissingAlt: 0,
    outgoingInternalCount: 0,
    outgoingExternalCount: 0,
    sampleInternalLinks: [],
    sampleExternalLinks: [],
    schemaTypes: [],
    hasDate: false,
    geo: {
      semanticHtml: true,
      structuredData: true,
      hasAuthor: true,
      hasDate: false,
      questionHeadings: 0,
      structuredBlocks: 0,
      answerable: false,
    },
    searchMetrics: {
      clicks,
      impressions,
      ctr: clicks / impressions,
      position: 4,
    },
  }
}
