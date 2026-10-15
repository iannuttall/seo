import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { auditCrawlPages } from './audit.js'

function page(input: Partial<CrawlPageSnapshot> = {}): CrawlPageSnapshot {
  return {
    url: 'https://example.com/product',
    finalUrl: 'https://example.com/product',
    status: 200,
    contentType: 'text/html',
    title: 'Example product for search teams',
    metaDescription:
      'A complete product description with enough context for search teams.',
    h1: 'Example product',
    h1Count: 1,
    h2Count: 1,
    h3Count: 0,
    canonical: 'https://example.com/product',
    indexable: true,
    wordCount: 500,
    contentHash: 'hash',
    hasViewport: true,
    lang: 'en',
    imagesTotal: 1,
    imagesMissingAlt: 0,
    outgoingInternalCount: 1,
    schemaTypes: ['Product'],
    invalidJsonLdCount: 0,
    invalidJsonLdSamples: [],
    openGraphTitle: 'Example product for search teams',
    openGraphDescription: 'A complete product sharing description.',
    openGraphImage: 'https://example.com/product.jpg',
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

test('audit separates missing rich-result properties from valid JSON', () => {
  const issues = auditCrawlPages([
    page({
      googleRichResults: [
        {
          format: 'json-ld',
          block: 0,
          path: '$',
          schemaType: 'Product',
          feature: 'product-snippet',
          status: 'missing-required-properties',
          observedProperties: [],
          missingRequiredProperties: [
            'name',
            'one of review, aggregateRating, or offers',
          ],
          limitations: ['Top-level property presence only.'],
          documentationUrl:
            'https://developers.google.com/search/docs/appearance/structured-data/product-snippet',
        },
      ],
    }),
  ])

  const issue = issues.find(
    (item) => item.ruleId === 'rich_result_required_fields_missing',
  )
  const assessments = issue?.evidence?.assessments as
    | Array<{ status: string }>
    | undefined
  assert.match(issue?.detail ?? '', /Product: name/)
  assert.equal(assessments?.[0]?.status, 'missing-required-properties')
  assert.equal(
    issues.some((item) => item.ruleId === 'jsonld_invalid'),
    false,
  )
})
