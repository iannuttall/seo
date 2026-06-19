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
    page({ status: 404 }),
    page({ url: 'https://example.com/500', status: 500 }),
  ])

  assert.deepEqual(
    issues.map((issue) => issue.ruleId),
    ['client_error', 'server_error'],
  )
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
