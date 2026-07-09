import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import {
  type CrawlPageSnapshot,
  compareCrawlPages,
  getRunPages,
  insertCrawlRun,
  latestCrawlSummaries,
  monitoringStatus,
  recommendCrawlDiffItem,
} from './monitoring.js'

const page = (input: Partial<CrawlPageSnapshot>): CrawlPageSnapshot => ({
  url: 'https://example.com/',
  finalUrl: 'https://example.com/',
  status: 200,
  title: 'Title',
  metaDescription: 'Description',
  canonical: 'https://example.com/',
  h1: 'Heading',
  indexable: true,
  wordCount: 500,
  contentHash: 'a',
  outgoingInternalCount: 2,
  ...input,
})

test('recommendCrawlDiffItem prioritizes new error statuses', () => {
  const recommendation = recommendCrawlDiffItem({
    kind: 'changed',
    url: 'https://example.com/broken',
    changes: ['status'],
    before: page({ status: 200 }),
    after: page({ status: 404 }),
  })

  assert.equal(recommendation?.severity, 'high')
  assert.equal(recommendation?.category, 'status')
  assert.match(recommendation?.action ?? '', /301/)
})

test('recommendCrawlDiffItem explains lost indexability', () => {
  const recommendation = recommendCrawlDiffItem({
    kind: 'changed',
    url: 'https://example.com/noindex',
    changes: ['indexability'],
    before: page({ indexable: true }),
    after: page({ indexable: false, metaRobots: 'noindex' }),
  })

  assert.equal(recommendation?.severity, 'high')
  assert.equal(recommendation?.category, 'indexability')
  assert.match(recommendation?.action ?? '', /noindex/)
})

test('compareCrawlPages detects added, removed, and changed URLs', () => {
  const result = compareCrawlPages({
    previous: [
      page({ url: 'https://example.com/a', title: 'Old' }),
      page({ url: 'https://example.com/removed' }),
    ],
    current: [
      page({ url: 'https://example.com/a', title: 'New' }),
      page({ url: 'https://example.com/new' }),
    ],
  })

  assert.deepEqual(
    result.map((item) => [item.kind, item.url, item.changes]),
    [
      ['changed', 'https://example.com/a', ['title']],
      ['added', 'https://example.com/new', ['url_added']],
      ['removed', 'https://example.com/removed', ['url_removed']],
    ],
  )
})

test('latestCrawlSummaries includes saved crawl recommendations', () => {
  const site = `sc-domain:crawl-${randomUUID()}.example`
  const url = `https://${site.slice('sc-domain:'.length)}/broken/`
  insertCrawlRun(
    {
      id: `run-${randomUUID()}`,
      site,
      startUrl: url,
      createdAt: new Date().toISOString(),
      limit: 1,
      urlCount: 1,
    },
    [page({ url, status: 404, indexable: false })],
    [
      {
        url,
        severity: 'high',
        category: 'status',
        title: 'Search-visible URL now returns an error',
        action: 'Restore the page or add a direct 301.',
        confidence: 'high',
      },
    ],
  )

  const latest = latestCrawlSummaries(site, 1)[0]
  assert.equal(latest?.statusErrors, 1)
  assert.equal(latest?.highPriorityRecommendations, 1)
  assert.equal(latest?.topRecommendation?.url, url)
  assert.match(latest?.topRecommendation?.action ?? '', /301/)
})

test('crawl store preserves rich page snapshots', () => {
  const site = `sc-domain:snapshot-${randomUUID()}.example`
  const url = `https://${site.slice('sc-domain:'.length)}/`
  const runId = `run-${randomUUID()}`
  insertCrawlRun(
    {
      id: runId,
      site,
      startUrl: url,
      createdAt: new Date().toISOString(),
      limit: 1,
      urlCount: 1,
    },
    [
      page({
        url,
        contentType: 'text/html',
        responseTimeMs: 123,
        h1Count: 1,
        h2Count: 3,
        imagesTotal: 4,
        imagesMissingAlt: 1,
        contentExtraction: {
          requested: 'defuddle',
          used: 'readability',
          fallback: true,
          fallbackReason: 'defuddle_empty',
          fallbackDetail: 'Defuddle returned no main content',
          wordCountSource: 'local_cjk_aware',
          baseUrl: url,
        },
        warnings: [
          'Defuddle extraction fell back to Readability: Defuddle returned no main content',
        ],
        outgoingExternalCount: 2,
        sampleExternalLinks: ['https://example.org/resource'],
        schemaTypes: ['Article'],
        geo: {
          semanticHtml: true,
          structuredData: true,
          hasAuthor: true,
          hasDate: true,
          questionHeadings: 2,
          structuredBlocks: 1,
          answerable: true,
        },
      }),
    ],
  )

  const saved = getRunPages(runId).get(url)
  assert.equal(saved?.contentType, 'text/html')
  assert.equal(saved?.responseTimeMs, 123)
  assert.equal(saved?.h2Count, 3)
  assert.equal(saved?.imagesMissingAlt, 1)
  assert.deepEqual(saved?.schemaTypes, ['Article'])
  assert.equal(saved?.geo?.structuredData, true)
  assert.equal(saved?.contentExtraction?.fallbackReason, 'defuddle_empty')
  assert.match(saved?.warnings?.[0] ?? '', /Readability/)
})

test('monitoringStatus flags saved crawl recommendations', () => {
  const site = `sc-domain:status-${randomUUID()}.example`
  const url = `https://${site.slice('sc-domain:'.length)}/broken/`
  insertCrawlRun(
    {
      id: `run-${randomUUID()}`,
      site,
      startUrl: url,
      createdAt: new Date().toISOString(),
      limit: 1,
      urlCount: 1,
    },
    [page({ url, status: 404, indexable: false })],
    [
      {
        url,
        severity: 'high',
        category: 'status',
        title: 'Search-visible URL now returns an error',
        action: 'Restore the page or add a direct 301.',
        confidence: 'high',
      },
    ],
  )

  const status = monitoringStatus({ site })
  const crawl = status.checks.find((check) => check.name === 'crawl')
  assert.equal(status.health, 'attention')
  assert.equal(crawl?.status, 'attention')
  assert.match(crawl?.action ?? '', /301/)
})
