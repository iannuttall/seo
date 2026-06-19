import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { auditCrawlPages } from './audit.js'

function page(input: Partial<CrawlPageSnapshot> = {}): CrawlPageSnapshot {
  return {
    url: 'https://example.com/page',
    finalUrl: 'https://example.com/page',
    status: 200,
    title: 'A useful page title',
    metaDescription: 'A useful page description.',
    canonical: 'https://example.com/page',
    h1: 'Useful page',
    h1Count: 1,
    indexable: true,
    wordCount: 500,
    contentHash: 'hash',
    hasViewport: true,
    lang: 'en',
    imagesTotal: 1,
    imagesMissingAlt: 0,
    outgoingInternalCount: 1,
    schemaTypes: ['Article'],
    openGraphTitle: 'A useful page title',
    twitterCard: 'summary',
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

test('auditCrawlPages flags response errors first', () => {
  const issues = auditCrawlPages([
    page({ status: 0, error: 'fetch failed' }),
    page({ status: 404 }),
    page({ url: 'https://example.com/500', status: 500 }),
    page({ url: 'https://example.com/raw-redirect', status: 302 }),
  ])

  assert.deepEqual(
    issues.map((issue) => issue.ruleId),
    ['connection_error', 'client_error', 'server_error', 'redirected_url'],
  )
  assert.equal(issues[0]?.evidence?.error, 'fetch failed')
})

test('auditCrawlPages flags redirected URLs with final target evidence', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/old',
      finalUrl: 'https://example.com/new',
      canonical: 'https://example.com/new',
    }),
  ])

  assert.equal(issues[0]?.ruleId, 'redirected_url')
  assert.equal(issues[0]?.evidence?.finalUrl, 'https://example.com/new')
})

test('auditCrawlPages flags redirect chains and slow responses', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/old',
      finalUrl: 'https://example.com/final',
      canonical: 'https://example.com/final',
      responseTimeMs: 2_500,
      fetchDiagnostics: {
        source: 'network',
        cache: 'miss',
        fetched: true,
        rendered: false,
        blocked: false,
        durationMs: 2_500,
        retries: 0,
        rateLimit: {
          host: 'example.com',
          concurrency: 8,
          intervalCap: 4,
          intervalMs: 1000,
        },
        redirectChain: [
          {
            url: 'https://example.com/old',
            status: 301,
            location: 'https://example.com/mid',
          },
          {
            url: 'https://example.com/mid',
            status: 301,
            location: 'https://example.com/final',
          },
        ],
      },
    }),
  ])

  assert.deepEqual(
    issues
      .filter((issue) => issue.category === 'response')
      .map((issue) => issue.ruleId),
    ['redirected_url', 'redirect_chain', 'slow_response'],
  )
  assert.equal(issues[1]?.evidence?.hops, 2)
  assert.equal(issues[2]?.evidence?.thresholdMs, 2000)
})

test('auditCrawlPages flags high-value on-page issues', () => {
  const issues = auditCrawlPages([
    page({
      title: undefined,
      metaDescription: undefined,
      canonical: undefined,
      h1: undefined,
      h1Count: 0,
      metaRobots: 'noindex',
      indexable: false,
      indexability: 'Meta robots noindex',
      wordCount: 80,
      imagesTotal: 2,
      imagesMissingAlt: 1,
      hasViewport: false,
      lang: undefined,
    }),
  ])

  assert.deepEqual(
    issues.map((issue) => issue.ruleId),
    [
      'missing_title',
      'missing_meta_description',
      'h1_count',
      'canonical_missing',
      'noindex',
      'thin_content',
      'image_missing_alt',
      'viewport_missing',
      'lang_missing',
    ],
  )
})

test('auditCrawlPages flags social, schema, and GEO gaps', () => {
  const issues = auditCrawlPages([
    page({
      schemaTypes: [],
      openGraphTitle: undefined,
      twitterCard: undefined,
      geo: {
        semanticHtml: false,
        structuredData: false,
        hasAuthor: false,
        hasDate: false,
        questionHeadings: 0,
        structuredBlocks: 0,
        answerable: false,
      },
    }),
  ])

  assert.deepEqual(
    issues.map((issue) => issue.ruleId),
    [
      'structured_data_missing',
      'og_title_missing',
      'twitter_card_missing',
      'geo_no_structured_data',
      'geo_not_answerable',
      'geo_no_author',
      'geo_no_semantic_html',
    ],
  )
})

test('auditCrawlPages copies search metrics onto issues', () => {
  const issues = auditCrawlPages([
    page({
      metaDescription: undefined,
      searchMetrics: {
        clicks: 12,
        impressions: 400,
        ctr: 0.03,
        position: 8.5,
      },
    }),
  ])

  assert.deepEqual(issues[0]?.searchMetrics, {
    clicks: 12,
    impressions: 400,
    ctr: 0.03,
    position: 8.5,
  })
})
