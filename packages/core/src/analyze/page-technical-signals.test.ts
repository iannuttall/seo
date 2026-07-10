import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExtractedPage } from '../types.js'
import { pageTechnicalSignals } from './page-technical-signals.js'

function page(input: Partial<ExtractedPage>): ExtractedPage {
  return {
    url: 'https://example.com/',
    finalUrl: 'https://example.com/',
    hasViewport: true,
    headings: [],
    links: [],
    hreflang: [],
    jsonLd: [],
    invalidJsonLdCount: 0,
    invalidJsonLdSamples: [],
    schemaTypes: [],
    openGraph: {},
    twitter: {},
    hasAuthor: false,
    hasDate: false,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    oversizedImageCandidates: [],
    mixedContentUrls: [],
    semanticHtml: false,
    questionHeadings: 0,
    listCount: 0,
    tableCount: 0,
    structuredBlocks: 0,
    answerable: false,
    contentText: '',
    wordCount: 0,
    contentExtraction: {
      requested: 'readability',
      used: 'readability',
      fallback: false,
      wordCountSource: 'local_cjk_aware',
      baseUrl: 'https://example.com/',
    },
    warnings: [],
    ...input,
  }
}

test('page technical signals expand none and ignore other-bot headers', () => {
  assert.deepEqual(
    pageTechnicalSignals({
      url: 'https://example.com/',
      page: page({ metaRobots: 'NONE', xRobotsTag: 'otherbot: none' }),
    }),
    ['meta-noindex'],
  )
})
